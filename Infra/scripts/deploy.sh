#!/usr/bin/env bash

set -Eeuo pipefail

readonly CONTAINER_PORT="8080"

# 앱은 서버 안에서만 듣는다. 밖에서 오는 요청은 nginx가 443에서 받아 여기로 넘긴다.
# project-public이 8080을 0.0.0.0/0으로 열어 두고 있어서(공용 보안 그룹이라 못 닫는다)
# 0.0.0.0을 허용하면 앱이 TLS 없이 인터넷에 그대로 노출된다. 변수로 두면 repository
# variable 하나로 그 상태가 되므로 상수로 박는다.
readonly BIND_ADDRESS="127.0.0.1"
readonly DEPLOY_LOCK_DIR="/tmp/yeogidam-deploy-${UID}"
readonly DEPLOY_LOCK_FILE="${DEPLOY_LOCK_DIR}/backend.lock"

# 블루그린 배포다. 앱 컨테이너는 블루(127.0.0.1:8080)와 그린(127.0.0.1:8081) 두 컨테이너 가운데 한쪽에서
# 돌고, nginx는 UPSTREAM_FILE이 가리키는 컨테이너에만 요청을 보낸다. 새 이미지는 요청을 받지 않는 반대쪽에 띄워
# liveness가 통과한 뒤에만 nginx를 그쪽으로 돌리고, 이전 컨테이너는 하던 분석 작업이 끝난 뒤 내린다.
# 새 컨테이너가 뜨지 않으면 nginx를 건드리지 않으므로 요청은 이전 컨테이너가 계속 받는다.
# 포트와 경로는 bootstrap-host.sh, switch-backend-upstream.sh, restart-backend.sh와 같은 값이어야 해서
# 변수로 받지 않고 상수로 박는다. 8081도 127.0.0.1에만 열리므로 공용 보안 그룹과 무관하다.
readonly BLUE_PORT="8080"
readonly GREEN_PORT="8081"
readonly UPSTREAM_FILE="/etc/nginx/yeogidam/backend-upstream.conf"
readonly NGINX_CONF="/etc/nginx/nginx.conf"
readonly SWITCH_COMMAND="/usr/local/sbin/yeogidam-switch-backend"
# 전환한 뒤 새 컨테이너가 계속 응답하는지 보는 시간이다. 이 안에 끊기면 이전 컨테이너로 되돌린다.
# 전환 직전에 이전 컨테이너가 받은 요청이 끝나기를 기다리는 시간도 겸한다.
readonly POST_SWITCH_CHECK_SECONDS=10
# 이전 컨테이너의 분석 작업(mediaExtractionExecutor)이 끝나기를 기다리는 최대 시간이다. 분석 하나가
# 외부 호출을 여럿 거쳐 수십 초 걸리므로 넉넉히 두고, 넘기면 경고만 남기고 내린다.
readonly DRAIN_TIMEOUT_SECONDS=120
readonly STOP_TIMEOUT_SECONDS=30

# ADR-01의 역할 태그다. digest로만 pull한 이미지는 로컬에서 태그가 없어 dangling으로 분류되므로,
# pull 직후 역할 태그를 붙여 직전 정상 이미지를 식별하고 정리에서 보호한다.
readonly ROLE_CURRENT="current"
readonly ROLE_PREVIOUS="previous"
readonly ROLE_CANDIDATE="candidate"

# 컨테이너 로그는 awslogs 드라이버가 CloudWatch로 보낸다. 우테코 공용 계정은 리전이
# ap-northeast-2 하나뿐이라 상수로 박는다. 로그 그룹 이름은 이 접두사 뒤에 환경과 backend를
# 붙여 만들고(LOG_GROUP), 스트림은 컨테이너마다 나눠(backend-blue, backend-green) 전환하는 동안 겹쳐
# 도는 두 컨테이너의 로그가 섞이지 않게 한다.
readonly AWS_REGION="ap-northeast-2"
readonly LOG_GROUP_PREFIX="/yeogidam"
readonly LOG_STREAM_PREFIX="backend"

fail() {
  printf '::error::%s\n' "$1"
  exit 1
}

require_value() {
  local name="$1"
  local value="$2"

  if [[ -z "$value" ]]; then
    fail "${name} 값이 비어 있습니다."
  fi
}

require_env_file_value() {
  local name="$1"
  local assignment value

  # Docker --env-file과 같이 마지막 중복 키를 쓴다. 값을 실행하거나 변환하지 않는다.
  assignment="$(grep -E "^${name}=" "$BACKEND_ENV_FILE" | tail -n 1 || true)"
  value="${assignment#*=}"
  if [[ -z "${value//[[:space:]]/}" ]]; then
    fail "${BACKEND_ENV_FILE}에 ${name}이 없거나 비어 있습니다."
  fi
}

container_exists() {
  docker container inspect "$1" >/dev/null 2>&1
}

container_running() {
  [[ "$(docker container inspect --format '{{.State.Running}}' "$1" 2>/dev/null || true)" == "true" ]]
}

container_health() {
  docker container inspect \
    --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
    "$1" 2>/dev/null || printf 'missing'
}

remove_container() {
  docker rm --force "$1" >/dev/null 2>&1 || true
}

wait_for_healthy() {
  local container_name="$1"
  local timeout_seconds="${2:-$HEALTH_TIMEOUT_SECONDS}"
  local deadline=$((SECONDS + timeout_seconds))
  local status

  while ((SECONDS < deadline)); do
    status="$(container_health "$container_name")"

    case "$status" in
      healthy)
        return 0
        ;;
      unhealthy|exited|dead|missing)
        return 1
        ;;
      *)
        sleep 2
        ;;
    esac
  done

  return 1
}

color_of_port() {
  if [[ "$1" == "$BLUE_PORT" ]]; then
    printf 'blue'
  else
    printf 'green'
  fi
}

color_label() {
  if [[ "$1" == "$BLUE_PORT" ]]; then
    printf '블루(%s:%s)' "$BIND_ADDRESS" "$1"
  else
    printf '그린(%s:%s)' "$BIND_ADDRESS" "$1"
  fi
}

other_port() {
  if [[ "$1" == "$BLUE_PORT" ]]; then
    printf '%s' "$GREEN_PORT"
  else
    printf '%s' "$BLUE_PORT"
  fi
}

container_name_of_port() {
  printf '%s-%s' "$BACKEND_CONTAINER_NAME" "$(color_of_port "$1")"
}

# nginx가 지금 요청을 보내는 컨테이너의 포트를 upstream 파일에서 읽는다. 이 파일은 전환 스크립트만 쓴다.
read_active_port() {
  grep -oE "server[[:space:]]+127\.0\.0\.1:(${BLUE_PORT}|${GREEN_PORT});" "$UPSTREAM_FILE" 2>/dev/null \
    | grep -oE "(${BLUE_PORT}|${GREEN_PORT})" | head -n 1 || true
}

# nginx.conf가 upstream 파일을 include하고 proxy_pass가 그 upstream을 가리키는지 본다. 블루그린 전
# bootstrap-host.sh로 nginx.conf를 다시 그리면 upstream 파일은 남은 채 nginx가 8080으로 바로 보내는데,
# 그 상태로 전환하면 새 컨테이너 확인은 통과하고 8080 컨테이너를 내리는 순간 모든 요청이 502가 된다.
nginx_conf_uses_upstream() {
  [[ -r "$NGINX_CONF" ]] \
    && grep -qE "^[[:space:]]*include[[:space:]]+${UPSTREAM_FILE//./\\.};" "$NGINX_CONF" \
    && grep -qE '^[[:space:]]*proxy_pass[[:space:]]+http://yeogidam_backend;' "$NGINX_CONF" \
    && ! grep -qE '^[[:space:]]*proxy_pass[[:space:]]+http://127\.0\.0\.1:' "$NGINX_CONF"
}

liveness_ok() {
  curl --silent --fail --max-time 2 --output /dev/null "http://${BIND_ADDRESS}:$1/actuator/health/liveness"
}

# 새 컨테이너가 요청을 받을 수 있을 때까지 기다린다. 이미지의 HEALTHCHECK는 30초 간격이라 첫 판정까지
# 30초가 걸리므로, 두 컨테이너가 겹치는 시간을 줄이려고 서버에서 liveness를 1초마다 직접 본다.
# 2026-10-29 개발 서버에서 같은 상한으로 두 번째 컨테이너를 띄웠을 때 15초 만에 응답했다.
wait_for_ready() {
  local container_name="$1"
  local port="$2"
  local deadline=$((SECONDS + HEALTH_TIMEOUT_SECONDS))

  while ((SECONDS < deadline)); do
    if ! container_running "$container_name" || [[ "$(container_health "$container_name")" == "unhealthy" ]]; then
      return 1
    fi

    if liveness_ok "$port"; then
      return 0
    fi

    sleep 1
  done

  return 1
}

# 전환한 뒤에도 새 컨테이너가 계속 응답하는지 본다. 기동 직후에만 살아 있다가 죽는 경우를 잡는다.
verify_after_switch() {
  local container_name="$1"
  local port="$2"
  local deadline=$((SECONDS + POST_SWITCH_CHECK_SECONDS))

  while ((SECONDS < deadline)); do
    if ! container_running "$container_name" || ! liveness_ok "$port"; then
      return 1
    fi

    sleep 1
  done
}

# 이전 컨테이너의 분석 실행기 지표(active, queued)를 정수로 읽는다. 못 읽으면 빈 값을 낸다.
# 지표는 스프링 부트가 ThreadPoolTaskExecutor 빈마다 executor.* 이름으로 자동으로 만든다.
executor_metric() {
  local port="$1"
  local metric="$2"
  local body

  body="$(curl --silent --fail --max-time 2 \
    "http://${BIND_ADDRESS}:${port}/actuator/metrics/executor.${metric}?tag=name:mediaExtractionExecutor" 2>/dev/null)" || return 0
  printf '%s' "$body" | grep -oE '"value":[0-9.]+' | head -n 1 | cut -d: -f2 | cut -d. -f1 || true
}

# 전환 뒤에는 이전 컨테이너로 새 요청이 가지 않으므로 돌던 분석 작업만 끝나면 내려도 된다. 실행기는
# 종료할 때 작업을 기다리는 시간(awaitTerminationSeconds)이 없어서, 바로 내리면 DB 연결이 먼저 닫혀
# 분석이 EXTRACTING에 멈출 수 있다. 그래서 내리기 전에 실행기가 빌 때까지 여기서 기다린다.
wait_for_drain() {
  local port="$1"
  local deadline=$((SECONDS + DRAIN_TIMEOUT_SECONDS))
  local active queued

  while ((SECONDS < deadline)); do
    active="$(executor_metric "$port" active)"
    queued="$(executor_metric "$port" queued)"

    if [[ -z "$active" || -z "$queued" ]]; then
      printf '::warning::이전 컨테이너의 분석 실행기 지표를 읽지 못해 기다리지 않고 내립니다.\n'
      return 0
    fi

    if [[ "$active" == "0" && "$queued" == "0" ]]; then
      return 0
    fi

    sleep 2
  done

  printf '::warning::이전 컨테이너의 분석 작업이 %s초 안에 끝나지 않았습니다. 남은 작업은 끊길 수 있습니다.\n' "$DRAIN_TIMEOUT_SECONDS"
}

# 상한이 없으면 메모리가 모자랄 때 커널이 점수를 매겨 희생자를 고르므로 앱이 아니라
# 러너가 죽을 수 있고, 러너가 죽으면 재배포도 롤백도 못 한다. 상한을 걸면 한도를 넘은
# 컨테이너가 먼저 죽으므로 러너는 살아남는다. 전환하는 동안에는 두 컨테이너가 같은 상한으로
# 함께 돈다(2026-10-29 개발 서버 실측: 남은 메모리 최소 152Mi, 스왑 49Mi 증가).
#
# BACKEND_MEMORY_SWAP_LIMIT은 스왑만의 값이 아니라 메모리와 스왑을 합친 총량이다.
# 비워 두면 도커가 상한의 두 배를 잡아 스왑 몫이 언제나 상한과 같아지므로, 나중에
# 메모리만 올리려 해도 스왑이 따라 올라간다. 그래서 두 값을 따로 받는다.
#
# 로그는 awslogs 드라이버가 CloudWatch 로그 그룹으로 바로 보낸다. 도커는 이중 로깅이
# 기본이라 서버에도 사본을 남겨 docker logs가 계속 되고, BACKEND_LOG_MAX_SIZE와
# BACKEND_LOG_MAX_FILE은 그 로컬 사본의 상한이지 CloudWatch 보존과는 무관하다.
# awslogs-create-group은 넣지 않는다. 우테코 계정은 태그 없는 리소스를 관리자가 지우므로
# 로그 그룹은 콘솔에서 태그를 달아 미리 만들어 두고, 그룹이 없으면 docker run이 실패해
# 전환 전에 멈춘다.
start_container() {
  local image="$1"
  local container_name="$2"
  local port="$3"

  docker run --detach \
    --name "$container_name" \
    --restart unless-stopped \
    --env-file "$BACKEND_ENV_FILE" \
    --publish "${BIND_ADDRESS}:${port}:${CONTAINER_PORT}" \
    --memory "$BACKEND_MEMORY_LIMIT" \
    --memory-swap "$BACKEND_MEMORY_SWAP_LIMIT" \
    --log-driver awslogs \
    --log-opt "awslogs-region=${AWS_REGION}" \
    --log-opt "awslogs-group=${LOG_GROUP}" \
    --log-opt "awslogs-stream=${LOG_STREAM_PREFIX}-$(color_of_port "$port")" \
    --log-opt "cache-max-size=${BACKEND_LOG_MAX_SIZE}" \
    --log-opt "cache-max-file=${BACKEND_LOG_MAX_FILE}" \
    --pull never \
    "$image" >/dev/null
}

role_tag() {
  printf '%s:%s' "$EXPECTED_IMAGE_NAME" "$1"
}

image_id_of() {
  docker image inspect --format '{{.Id}}' "$1" 2>/dev/null || true
}

role_repo_digest() {
  docker image inspect \
    --format '{{if .RepoDigests}}{{index .RepoDigests 0}}{{end}}' \
    "$(role_tag "$1")" 2>/dev/null || true
}

tag_image() {
  local source="$1"
  local target="$2"

  if ! docker tag "$source" "$target" >/dev/null 2>&1; then
    printf '::warning::이미지 태그 %s를 붙이지 못했습니다.\n' "$target"
  fi
}

untag_role() {
  local tag
  tag="$(role_tag "$1")"

  if ! docker image inspect "$tag" >/dev/null 2>&1; then
    return 0
  fi

  if ! docker rmi "$tag" >/dev/null 2>&1; then
    printf '::warning::이미지 태그 %s를 떼지 못했습니다.\n' "$tag"
  fi
}

tag_candidate_image() {
  tag_image "$IMAGE_REFERENCE" "$(role_tag "$ROLE_CANDIDATE")"

  if [[ "${GITHUB_SHA:-}" =~ ^[0-9a-f]{7,64}$ ]]; then
    tag_image "$IMAGE_REFERENCE" "$(role_tag "$GITHUB_SHA")"
  fi
}

# 배포가 성공했을 때만 부른다. 기존 current를 previous로 내리고 후보를 current로 올린다.
# 같은 이미지를 다시 배포한 경우에는 previous를 건드리지 않는다.
promote_role_tags() {
  local current_id
  current_id="$(image_id_of "$(role_tag "$ROLE_CURRENT")")"

  if [[ -n "$current_id" && "$current_id" != "$TARGET_IMAGE_ID" ]]; then
    tag_image "$current_id" "$(role_tag "$ROLE_PREVIOUS")"
  fi

  tag_image "$TARGET_IMAGE_ID" "$(role_tag "$ROLE_CURRENT")"
  untag_role "$ROLE_CANDIDATE"
}

# ADR-01의 삭제 금지 목록을 먼저 만든 뒤 그 밖의 Backend 이미지만 지운다.
# 서버 전체를 대상으로 하는 docker image prune은 쓰지 않는다.
prune_backend_images() {
  local protected=()
  local role container keep id

  for role in "$ROLE_CURRENT" "$ROLE_PREVIOUS" "$ROLE_CANDIDATE"; do
    id="$(image_id_of "$(role_tag "$role")")"

    if [[ -n "$id" ]]; then
      protected+=("$id")
    fi
  done

  for container in "$(container_name_of_port "$BLUE_PORT")" "$(container_name_of_port "$GREEN_PORT")" "$LEGACY_CONTAINER_NAME"; do
    id="$(docker container inspect --format '{{.Image}}' "$container" 2>/dev/null || true)"

    if [[ -n "$id" ]]; then
      protected+=("$id")
    fi
  done

  if ((${#protected[@]} == 0)); then
    printf '::warning::보존할 이미지를 찾지 못해 로컬 이미지 정리를 건너뜁니다.\n'
    return 0
  fi

  while read -r id; do
    if [[ -z "$id" ]]; then
      continue
    fi

    for keep in "${protected[@]}"; do
      if [[ "$id" == "$keep" ]]; then
        continue 2
      fi
    done

    if ! docker rmi --force "$id" >/dev/null 2>&1; then
      printf '::warning::로컬 이미지 %s를 정리하지 못했습니다.\n' "$id"
    fi
  done < <(docker images --no-trunc --filter "reference=${EXPECTED_IMAGE_NAME}" --format '{{.ID}}' | sort --unique)
}

write_summary() {
  local result="$1"
  local switch_result="${2:-해당 없음}"
  local serving_port="${3:-$ACTIVE_PORT}"
  local current_digest previous_digest

  if [[ -z "${GITHUB_STEP_SUMMARY:-}" ]]; then
    return
  fi

  current_digest="$(role_repo_digest "$ROLE_CURRENT")"
  previous_digest="$(role_repo_digest "$ROLE_PREVIOUS")"

  {
    printf '## Backend %s 배포\n\n' "${DEPLOY_ENVIRONMENT:-운영}"
    printf -- "- Git SHA: \`%s\`\n" "${GITHUB_SHA:-unknown}"
    printf -- "- 이미지: \`%s\`\n" "$IMAGE_REFERENCE"
    printf -- "- 요청 받는 컨테이너: %s, \`%s\`\n" "$(color_label "$serving_port")" "$(container_name_of_port "$serving_port")"
    printf -- "- 자원: \`--memory %s\`, \`--memory-swap %s\`, 헬스 대기 %s초\n" "$BACKEND_MEMORY_LIMIT" "$BACKEND_MEMORY_SWAP_LIMIT" "$HEALTH_TIMEOUT_SECONDS"
    printf -- "- 로그: CloudWatch \`%s\` 스트림 \`%s-blue\`, \`%s-green\`, 로컬 캐시 \`cache-max-size %s\`, \`cache-max-file %s\`\n" "$LOG_GROUP" "$LOG_STREAM_PREFIX" "$LOG_STREAM_PREFIX" "$BACKEND_LOG_MAX_SIZE" "$BACKEND_LOG_MAX_FILE"
    printf -- "- 현재 이미지: \`%s\`\n" "${current_digest:-없음}"
    printf -- "- 직전 이미지: \`%s\`\n" "${previous_digest:-없음}"
    printf -- "- 결과: \`%s\`\n" "$result"
    printf -- "- 전환: \`%s\`\n" "$switch_result"
  } >> "$GITHUB_STEP_SUMMARY"
}

finish_success() {
  local result="$1"
  local switch_result="${2:-해당 없음}"
  local serving_port="${3:-$ACTIVE_PORT}"

  promote_role_tags
  prune_backend_images
  write_summary "$result" "$switch_result" "$serving_port"
  exit 0
}

# nginx를 돌리기 전에 멈출 때 부른다. 새 컨테이너만 지우므로 요청은 이전 컨테이너가 계속 받는다.
abort_before_switch() {
  local reason="$1"

  printf '::error::%s\n' "$reason"
  remove_container "$IDLE_NAME"
  untag_role "$ROLE_CANDIDATE"
  write_summary "실패" "전환 전에 멈춤. 요청은 계속 $(color_label "$ACTIVE_PORT")에서 받음" "$ACTIVE_PORT"
  exit 1
}

# nginx를 돌린 뒤 새 컨테이너가 응답하지 않을 때 부른다. 이전 컨테이너는 아직 내리지 않았으므로
# nginx를 이전 컨테이너로 되돌리면 바로 복구된다.
revert_and_fail() {
  local reason="$1"

  printf '::error::%s\n' "$reason"

  if container_running "$ACTIVE_NAME" && liveness_ok "$ACTIVE_PORT" && sudo -n "$SWITCH_COMMAND" "$ACTIVE_PORT"; then
    remove_container "$IDLE_NAME"
    untag_role "$ROLE_CANDIDATE"
    write_summary "실패" "전환 뒤 응답이 끊겨 되돌림. 요청은 다시 $(color_label "$ACTIVE_PORT")에서 받음" "$ACTIVE_PORT"
  else
    untag_role "$ROLE_CANDIDATE"
    write_summary "실패" "되돌리지 못함. EC2에서 컨테이너와 nginx 상태 확인 필요" "$IDLE_PORT"
    printf '::error::이전 컨테이너로 되돌리지 못했습니다. EC2에서 컨테이너와 nginx 상태를 확인해 주세요.\n'
  fi

  exit 1
}

require_value "IMAGE_REFERENCE" "${IMAGE_REFERENCE:-}"
require_value "EXPECTED_IMAGE_NAME" "${EXPECTED_IMAGE_NAME:-}"
require_value "BACKEND_ENV_FILE" "${BACKEND_ENV_FILE:-}"
require_value "BACKEND_CONTAINER_NAME" "${BACKEND_CONTAINER_NAME:-}"
require_value "BACKEND_HEALTH_TIMEOUT_SECONDS" "${BACKEND_HEALTH_TIMEOUT_SECONDS:-}"
require_value "EXPECTED_SPRING_PROFILE" "${EXPECTED_SPRING_PROFILE:-}"
require_value "BACKEND_MEMORY_LIMIT" "${BACKEND_MEMORY_LIMIT:-}"
require_value "BACKEND_MEMORY_SWAP_LIMIT" "${BACKEND_MEMORY_SWAP_LIMIT:-}"
require_value "BACKEND_LOG_MAX_SIZE" "${BACKEND_LOG_MAX_SIZE:-}"
require_value "BACKEND_LOG_MAX_FILE" "${BACKEND_LOG_MAX_FILE:-}"

# 값이 도커 표기가 아니면 docker run이 컨테이너를 만들기 직전에 실패한다. 블루그린에서는 그래도
# 요청이 끊기지 않지만 오타 하나가 배포 실패로 기록되므로 시작하기 전에 형식을 본다.
# BACKEND_LOG_MAX_SIZE와 BACKEND_LOG_MAX_FILE은 awslogs 드라이버의 로컬 캐시(cache-max-size,
# cache-max-file) 상한인데, 이 캐시도 json-file과 같은 크기 표기를 받는다.
for name in BACKEND_MEMORY_LIMIT BACKEND_MEMORY_SWAP_LIMIT BACKEND_LOG_MAX_SIZE; do
  if [[ ! "${!name}" =~ ^[0-9]+[bkmgBKMG]$ ]]; then
    fail "${name}이 도커 크기 표기가 아닙니다. 512m처럼 숫자와 단위로 적어 주세요. 지금 값은 ${!name}입니다."
  fi
done

if [[ ! "$BACKEND_LOG_MAX_FILE" =~ ^[1-9][0-9]*$ ]]; then
  fail "BACKEND_LOG_MAX_FILE은 1 이상의 정수여야 합니다. 지금 값은 ${BACKEND_LOG_MAX_FILE}입니다."
fi

if [[ "$EXPECTED_IMAGE_NAME" != */* || "$EXPECTED_IMAGE_NAME" == *:* || "$EXPECTED_IMAGE_NAME" == *@* ]]; then
  fail "EXPECTED_IMAGE_NAME은 태그와 digest가 없는 namespace/repository 형식이어야 합니다."
fi

IMAGE_PREFIX="${EXPECTED_IMAGE_NAME}@"
if [[ "$IMAGE_REFERENCE" != "${IMAGE_PREFIX}"* ]]; then
  fail "허용되지 않은 Docker 이미지 저장소입니다."
fi

IMAGE_DIGEST="${IMAGE_REFERENCE#"$IMAGE_PREFIX"}"
if [[ ! "$IMAGE_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]]; then
  fail "Docker 이미지 digest 형식이 올바르지 않습니다."
fi

if [[ "$BACKEND_ENV_FILE" != /* || ! -f "$BACKEND_ENV_FILE" || ! -r "$BACKEND_ENV_FILE" ]]; then
  fail "BACKEND_ENV_FILE은 EC2에 존재하고 읽을 수 있는 파일의 절대경로여야 합니다."
fi

if [[ ! "$EXPECTED_SPRING_PROFILE" =~ ^[a-z][a-z0-9-]*$ ]]; then
  fail "EXPECTED_SPRING_PROFILE은 소문자로 시작하는 프로필 이름이어야 합니다."
fi

# 프로필을 빠뜨리면 profiles.default인 local로 기동해 로컬 전용 DB 초기화와 샘플 삽입 설정이 선택된다.
# --env-file은 같은 키가 여러 번 나오면 마지막 줄을 쓰므로 마지막 줄만 대조한다.
# 실제 값은 로그에 내지 않고 기대하는 형식만 알린다.
ACTIVE_PROFILE_LINE="$(grep -E '^SPRING_PROFILES_ACTIVE=' "$BACKEND_ENV_FILE" | tail -n 1 || true)"
if [[ "$ACTIVE_PROFILE_LINE" != "SPRING_PROFILES_ACTIVE=${EXPECTED_SPRING_PROFILE}" ]]; then
  fail "${BACKEND_ENV_FILE}의 SPRING_PROFILES_ACTIVE가 ${EXPECTED_SPRING_PROFILE}가 아닙니다. 따옴표와 공백 없이 SPRING_PROFILES_ACTIVE=${EXPECTED_SPRING_PROFILE} 한 줄로 적어 주세요."
fi

# 앱 계정은 DML만 허용하고 Flyway는 별도 계정을 쓴다. 새 컨테이너를 띄우기 전에 누락을 잡는다.
require_env_file_value "FLYWAY_USERNAME"
require_env_file_value "FLYWAY_PASSWORD"

# CloudWatch 로그 그룹은 /yeogidam/dev/backend, /yeogidam/prod/backend처럼 환경 이름을 품는데,
# 그 환경 이름이 스프링 프로필 이름(dev, prod)과 같다. 그래서 환경용 변수를 따로 받지 않고
# 위에서 검증을 마친 EXPECTED_SPRING_PROFILE로 그룹 이름을 만든다. 변수를 하나 더 두면
# 두 값이 어긋났을 때 로그가 엉뚱한 환경의 그룹으로 간다.
LOG_GROUP="${LOG_GROUP_PREFIX}/${EXPECTED_SPRING_PROFILE}/backend"

if [[ ! "$BACKEND_CONTAINER_NAME" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]*$ ]]; then
  fail "BACKEND_CONTAINER_NAME 형식이 올바르지 않습니다."
fi

# 블루그린 전 deploy.sh는 블루와 그린 구분 없이 이 이름 하나로 8080에서 돌렸고, 중간에 끊기면 -rollback을 남겼다.
LEGACY_CONTAINER_NAME="$BACKEND_CONTAINER_NAME"
LEGACY_ROLLBACK_CONTAINER_NAME="${BACKEND_CONTAINER_NAME}-rollback"

if [[ ! "$BACKEND_HEALTH_TIMEOUT_SECONDS" =~ ^[0-9]{1,3}$ ]]; then
  fail "BACKEND_HEALTH_TIMEOUT_SECONDS는 1자리부터 3자리까지의 숫자여야 합니다."
fi

HEALTH_TIMEOUT_SECONDS=$((10#$BACKEND_HEALTH_TIMEOUT_SECONDS))
if ((HEALTH_TIMEOUT_SECONDS < 1 || HEALTH_TIMEOUT_SECONDS > 240)); then
  fail "BACKEND_HEALTH_TIMEOUT_SECONDS는 1초부터 240초 사이여야 합니다."
fi

command -v docker >/dev/null 2>&1 || fail "EC2에 Docker가 설치되어 있지 않습니다."
command -v flock >/dev/null 2>&1 || fail "EC2에 flock이 설치되어 있지 않습니다."
command -v curl >/dev/null 2>&1 || fail "EC2에 curl이 설치되어 있지 않습니다."
command -v sudo >/dev/null 2>&1 || fail "EC2에 sudo가 설치되어 있지 않습니다."
docker info >/dev/null 2>&1 || fail "Self-hosted Runner가 Docker daemon에 접근할 수 없습니다."

# 블루그린 장치(bootstrap-host.sh가 놓는다)가 없으면 아무것도 건드리지 않고 멈춘다. 이 확인을
# 컨테이너를 만지기 전에 하므로, 장치를 깔기 전에 이 스크립트가 돌아도 지금 앱은 그대로 돈다.
if [[ ! -r "$UPSTREAM_FILE" ]]; then
  fail "nginx 블루그린 설정 ${UPSTREAM_FILE}이 없습니다. 서버에서 Infra/scripts/bootstrap-host.sh를 다시 돌려 주세요."
fi

if ! nginx_conf_uses_upstream; then
  fail "${NGINX_CONF}가 ${UPSTREAM_FILE}을 쓰지 않습니다. 블루그린 전 설정이라 전환하면 요청이 끊기므로 멈춥니다. 서버에서 최신 Infra/scripts/bootstrap-host.sh를 다시 돌려 주세요."
fi

ACTIVE_PORT="$(read_active_port)"
if [[ -z "$ACTIVE_PORT" ]]; then
  fail "${UPSTREAM_FILE}에서 앱 포트(${BLUE_PORT} 또는 ${GREEN_PORT})를 읽지 못했습니다."
fi

IDLE_PORT="$(other_port "$ACTIVE_PORT")"

for port in "$IDLE_PORT" "$ACTIVE_PORT"; do
  if ! sudo -n -l "$SWITCH_COMMAND" "$port" >/dev/null 2>&1; then
    fail "러너가 ${SWITCH_COMMAND} ${port}을 sudo로 부를 수 없습니다. 서버에서 bootstrap-host.sh를 다시 돌려 sudoers를 넣어 주세요."
  fi
done

if [[ -e "$DEPLOY_LOCK_DIR" && ( -L "$DEPLOY_LOCK_DIR" || ! -d "$DEPLOY_LOCK_DIR" || ! -O "$DEPLOY_LOCK_DIR" ) ]]; then
  fail "배포 lock 디렉터리의 소유권 또는 형식이 올바르지 않습니다."
fi

umask 077
mkdir -p "$DEPLOY_LOCK_DIR"
chmod 700 "$DEPLOY_LOCK_DIR"

exec 9>"$DEPLOY_LOCK_FILE"
flock -n 9 || fail "다른 Backend 배포나 재시작이 EC2에서 진행 중입니다."

ACTIVE_NAME="$(container_name_of_port "$ACTIVE_PORT")"
IDLE_NAME="$(container_name_of_port "$IDLE_PORT")"

# 블루그린 전 스크립트가 중간에 끊겨 남긴 롤백 컨테이너는 어느 쪽이 정상인지 사람이 보고 정리한다.
if container_exists "$LEGACY_ROLLBACK_CONTAINER_NAME"; then
  fail "블루그린 전 배포 스크립트가 남긴 ${LEGACY_ROLLBACK_CONTAINER_NAME}가 있습니다. EC2에서 상태를 확인하고 정리한 뒤 다시 실행해 주세요."
fi

# 블루그린으로 처음 배포할 때는 예전 이름의 컨테이너가 8080에서 요청을 받고 있으므로 그것을 블루로 본다.
# 반대로 그린이 받는 중에 예전 이름이 남아 있으면 8080을 막고 있는 찌꺼기라 지운다.
if [[ "$ACTIVE_PORT" == "$BLUE_PORT" ]] && ! container_exists "$ACTIVE_NAME" && container_exists "$LEGACY_CONTAINER_NAME"; then
  ACTIVE_NAME="$LEGACY_CONTAINER_NAME"
elif [[ "$IDLE_PORT" == "$BLUE_PORT" ]] && container_exists "$LEGACY_CONTAINER_NAME"; then
  if ! container_running "$ACTIVE_NAME"; then
    fail "nginx는 그린을 가리키는데 그린 컨테이너가 없고 예전 이름의 컨테이너(${LEGACY_CONTAINER_NAME})만 있습니다. EC2에서 상태를 확인해 주세요."
  fi
  remove_container "$LEGACY_CONTAINER_NAME"
fi

docker pull "$IMAGE_REFERENCE"
TARGET_IMAGE_ID="$(docker image inspect --format '{{.Id}}' "$IMAGE_REFERENCE")"
tag_candidate_image

if container_exists "$ACTIVE_NAME"; then
  ACTIVE_IMAGE_ID="$(docker container inspect --format '{{.Image}}' "$ACTIVE_NAME")"
  ACTIVE_HEALTH="$(container_health "$ACTIVE_NAME")"

  if [[ "$ACTIVE_IMAGE_ID" == "$TARGET_IMAGE_ID" ]]; then
    if [[ "$ACTIVE_HEALTH" == "healthy" ]] || wait_for_healthy "$ACTIVE_NAME"; then
      # 지난 배포가 반대쪽에 남긴 컨테이너는 요청을 받지 않으므로 지워도 끊기지 않는다.
      remove_container "$IDLE_NAME"
      finish_success "이미 배포된 정상 이미지 유지"
    fi
    # 같은 이미지인데 건강하지 않으면 아래에서 반대쪽에 새로 띄워 넘긴다.
  elif [[ "$ACTIVE_HEALTH" != "healthy" ]]; then
    fail "지금 요청을 받는 컨테이너(${ACTIVE_NAME})가 정상 상태가 아니므로 자동 교체하지 않습니다. EC2 상태를 먼저 확인해 주세요."
  fi
fi

# 반대쪽에 남은 컨테이너는 지난 배포가 중간에 끊긴 흔적이다. nginx가 요청을 보내지 않는 쪽이라 지운다.
remove_container "$IDLE_NAME"

if ! start_container "$IMAGE_REFERENCE" "$IDLE_NAME" "$IDLE_PORT"; then
  abort_before_switch "새 Backend 컨테이너를 시작하지 못했습니다."
fi

if ! wait_for_ready "$IDLE_NAME" "$IDLE_PORT"; then
  abort_before_switch "새 Backend 컨테이너의 liveness 확인에 실패했습니다. 최종 상태: $(container_health "$IDLE_NAME")"
fi

if ! sudo -n "$SWITCH_COMMAND" "$IDLE_PORT"; then
  abort_before_switch "nginx를 새 컨테이너로 돌리지 못했습니다."
fi

if [[ "$(read_active_port)" != "$IDLE_PORT" ]]; then
  revert_and_fail "전환 스크립트는 끝났지만 ${UPSTREAM_FILE}이 ${IDLE_PORT}을 가리키지 않습니다."
fi

if ! verify_after_switch "$IDLE_NAME" "$IDLE_PORT"; then
  revert_and_fail "전환 뒤 새 컨테이너가 응답하지 않았습니다. 최종 상태: $(container_health "$IDLE_NAME")"
fi

SWITCH_RESULT="$(color_label "$ACTIVE_PORT") → $(color_label "$IDLE_PORT")"

if container_exists "$ACTIVE_NAME"; then
  if container_running "$ACTIVE_NAME"; then
    wait_for_drain "$ACTIVE_PORT"
  fi

  if ! docker stop --time "$STOP_TIMEOUT_SECONDS" "$ACTIVE_NAME" >/dev/null || ! docker rm "$ACTIVE_NAME" >/dev/null; then
    printf '::warning::이전 컨테이너 %s를 정리하지 못했습니다. 요청은 새 컨테이너가 받고 있습니다.\n' "$ACTIVE_NAME"
    SWITCH_RESULT="${SWITCH_RESULT}, 이전 컨테이너 정리 실패"
  fi
fi

finish_success "성공" "$SWITCH_RESULT" "$IDLE_PORT"
