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

# ADR-01의 역할 태그다. digest로만 pull한 이미지는 로컬에서 태그가 없어 dangling으로 분류되므로,
# pull 직후 역할 태그를 붙여 직전 정상 이미지를 식별하고 정리에서 보호한다.
readonly ROLE_CURRENT="current"
readonly ROLE_PREVIOUS="previous"
readonly ROLE_CANDIDATE="candidate"

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

container_health() {
  docker container inspect \
    --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
    "$1" 2>/dev/null || printf 'missing'
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

# 상한이 없으면 메모리가 모자랄 때 커널이 점수를 매겨 희생자를 고르므로 앱이 아니라
# 러너가 죽을 수 있고, 러너가 죽으면 재배포도 롤백도 못 한다. 상한을 걸면 한도를 넘은
# 컨테이너가 먼저 죽으므로 러너는 살아남는다.
#
# BACKEND_MEMORY_SWAP_LIMIT은 스왑만의 값이 아니라 메모리와 스왑을 합친 총량이다.
# 비워 두면 도커가 상한의 두 배를 잡아 스왑 몫이 언제나 상한과 같아지므로, 나중에
# 메모리만 올리려 해도 스왑이 따라 올라간다. 그래서 두 값을 따로 받는다.
start_container() {
  local image="$1"

  docker run --detach \
    --name "$BACKEND_CONTAINER_NAME" \
    --restart unless-stopped \
    --env-file "$BACKEND_ENV_FILE" \
    --publish "${BIND_ADDRESS}:${BACKEND_HOST_PORT}:${CONTAINER_PORT}" \
    --memory "$BACKEND_MEMORY_LIMIT" \
    --memory-swap "$BACKEND_MEMORY_SWAP_LIMIT" \
    --log-driver json-file \
    --log-opt "max-size=${BACKEND_LOG_MAX_SIZE}" \
    --log-opt "max-file=${BACKEND_LOG_MAX_FILE}" \
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

  for container in "$BACKEND_CONTAINER_NAME" "$ROLLBACK_CONTAINER_NAME"; do
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
  local rollback_result="${2:-해당 없음}"
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
    printf -- "- 컨테이너: \`%s\`\n" "$BACKEND_CONTAINER_NAME"
    printf -- "- 포트: \`%s:%s\`\n" "$BIND_ADDRESS" "$BACKEND_HOST_PORT"
    printf -- "- 자원: \`--memory %s\`, \`--memory-swap %s\`, 헬스 대기 %s초\n" "$BACKEND_MEMORY_LIMIT" "$BACKEND_MEMORY_SWAP_LIMIT" "$HEALTH_TIMEOUT_SECONDS"
    printf -- "- 현재 이미지: \`%s\`\n" "${current_digest:-없음}"
    printf -- "- 직전 이미지: \`%s\`\n" "${previous_digest:-없음}"
    printf -- "- 결과: \`%s\`\n" "$result"
    printf -- "- 롤백: \`%s\`\n" "$rollback_result"
  } >> "$GITHUB_STEP_SUMMARY"
}

finish_success() {
  local result="$1"
  local rollback_result="${2:-해당 없음}"

  promote_role_tags
  prune_backend_images
  write_summary "$result" "$rollback_result"
  exit 0
}

restore_rollback_container() {
  local rollback_running

  if ! docker container inspect "$ROLLBACK_CONTAINER_NAME" >/dev/null 2>&1; then
    return 1
  fi

  docker rm --force "$BACKEND_CONTAINER_NAME" >/dev/null 2>&1 || true

  if ! docker rename "$ROLLBACK_CONTAINER_NAME" "$BACKEND_CONTAINER_NAME"; then
    return 1
  fi

  rollback_running="$(docker container inspect --format '{{.State.Running}}' "$BACKEND_CONTAINER_NAME")"
  if [[ "$rollback_running" != "true" ]] && ! docker start "$BACKEND_CONTAINER_NAME" >/dev/null; then
    return 1
  fi

  # 방금 전까지 건강하던 컨테이너라 뜨는 것은 시간문제다. 새 컨테이너를 빨리 포기하려고
  # BACKEND_HEALTH_TIMEOUT_SECONDS를 짧게 잡았더라도 여기서는 최소 60초를 준다. 아니면
  # 복구가 되는데도 복구 실패로 기록된다. 2026-09-30 롤백 시험에서 확인한 것이다.
  wait_for_healthy "$BACKEND_CONTAINER_NAME" "$(( HEALTH_TIMEOUT_SECONDS < 60 ? 60 : HEALTH_TIMEOUT_SECONDS ))"
}

rollback_and_fail() {
  local reason="$1"
  local rollback_result

  printf '::error::%s\n' "$reason"
  docker rm --force "$BACKEND_CONTAINER_NAME" >/dev/null 2>&1 || true
  untag_role "$ROLE_CANDIDATE"

  if ! docker container inspect "$ROLLBACK_CONTAINER_NAME" >/dev/null 2>&1; then
    rollback_result="직전 컨테이너 없음"
  elif restore_rollback_container; then
    rollback_result="직전 컨테이너 복구 성공"
  else
    rollback_result="직전 컨테이너 복구 실패"
    printf '::error::직전 컨테이너로 롤백하지 못했습니다. EC2에서 컨테이너 상태를 확인해 주세요.\n'
  fi

  write_summary "실패" "$rollback_result"
  exit 1
}

require_value "IMAGE_REFERENCE" "${IMAGE_REFERENCE:-}"
require_value "EXPECTED_IMAGE_NAME" "${EXPECTED_IMAGE_NAME:-}"
require_value "BACKEND_ENV_FILE" "${BACKEND_ENV_FILE:-}"
require_value "BACKEND_HOST_PORT" "${BACKEND_HOST_PORT:-}"
require_value "BACKEND_CONTAINER_NAME" "${BACKEND_CONTAINER_NAME:-}"
require_value "BACKEND_HEALTH_TIMEOUT_SECONDS" "${BACKEND_HEALTH_TIMEOUT_SECONDS:-}"
require_value "EXPECTED_SPRING_PROFILE" "${EXPECTED_SPRING_PROFILE:-}"
require_value "BACKEND_MEMORY_LIMIT" "${BACKEND_MEMORY_LIMIT:-}"
require_value "BACKEND_MEMORY_SWAP_LIMIT" "${BACKEND_MEMORY_SWAP_LIMIT:-}"
require_value "BACKEND_LOG_MAX_SIZE" "${BACKEND_LOG_MAX_SIZE:-}"
require_value "BACKEND_LOG_MAX_FILE" "${BACKEND_LOG_MAX_FILE:-}"

# 값이 도커 표기가 아니면 docker run이 컨테이너를 만들기 직전에 실패한다. 그때는 이미
# 기존 컨테이너를 rename한 뒤라 롤백 경로를 타므로, 오타 하나가 배포 실패로 기록된다.
# 그래서 시작하기 전에 형식을 본다.
for name in BACKEND_MEMORY_LIMIT BACKEND_MEMORY_SWAP_LIMIT BACKEND_LOG_MAX_SIZE; do
  if [[ ! "${!name}" =~ ^[0-9]+[bkmgBKMG]$ ]]; then
    fail "${name}이 도커 크기 표기가 아닙니다. 512m처럼 숫자와 단위로 적어 주세요. 지금 값은 ${!name}입니다."
  fi
done

if [[ ! "$BACKEND_LOG_MAX_FILE" =~ ^[1-9][0-9]*$ ]]; then
  fail "BACKEND_LOG_MAX_FILE은 1 이상의 정수여야 합니다. 지금 값은 ${BACKEND_LOG_MAX_FILE}입니다."
fi

ROLLBACK_CONTAINER_NAME="${BACKEND_CONTAINER_NAME}-rollback"

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

# 프로필을 빠뜨리면 profiles.default인 local로 기동하고, application-local.yml의
# sql.init.mode=always가 DROP TABLE로 시작하는 schema.sql을 실행해 테이블이 지워진다.
# --env-file은 같은 키가 여러 번 나오면 마지막 줄을 쓰므로 마지막 줄만 대조한다.
# 실제 값은 로그에 내지 않고 기대하는 형식만 알린다.
ACTIVE_PROFILE_LINE="$(grep -E '^SPRING_PROFILES_ACTIVE=' "$BACKEND_ENV_FILE" | tail -n 1 || true)"
if [[ "$ACTIVE_PROFILE_LINE" != "SPRING_PROFILES_ACTIVE=${EXPECTED_SPRING_PROFILE}" ]]; then
  fail "${BACKEND_ENV_FILE}의 SPRING_PROFILES_ACTIVE가 ${EXPECTED_SPRING_PROFILE}가 아닙니다. 따옴표와 공백 없이 SPRING_PROFILES_ACTIVE=${EXPECTED_SPRING_PROFILE} 한 줄로 적어 주세요."
fi

if [[ ! "$BACKEND_CONTAINER_NAME" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]*$ ]]; then
  fail "BACKEND_CONTAINER_NAME 형식이 올바르지 않습니다."
fi

if [[ ! "$BACKEND_HOST_PORT" =~ ^[0-9]{1,5}$ ]]; then
  fail "BACKEND_HOST_PORT는 1자리부터 5자리까지의 숫자여야 합니다."
fi

HOST_PORT_NUMBER=$((10#$BACKEND_HOST_PORT))
if ((HOST_PORT_NUMBER < 1 || HOST_PORT_NUMBER > 65535)); then
  fail "BACKEND_HOST_PORT는 1부터 65535 사이여야 합니다."
fi

if [[ ! "$BACKEND_HEALTH_TIMEOUT_SECONDS" =~ ^[0-9]{1,3}$ ]]; then
  fail "BACKEND_HEALTH_TIMEOUT_SECONDS는 1자리부터 3자리까지의 숫자여야 합니다."
fi

HEALTH_TIMEOUT_SECONDS=$((10#$BACKEND_HEALTH_TIMEOUT_SECONDS))
if ((HEALTH_TIMEOUT_SECONDS < 1 || HEALTH_TIMEOUT_SECONDS > 240)); then
  fail "BACKEND_HEALTH_TIMEOUT_SECONDS는 1초부터 240초 사이여야 합니다."
fi

command -v docker >/dev/null 2>&1 || fail "EC2에 Docker가 설치되어 있지 않습니다."
command -v flock >/dev/null 2>&1 || fail "EC2에 flock이 설치되어 있지 않습니다."
docker info >/dev/null 2>&1 || fail "Self-hosted Runner가 Docker daemon에 접근할 수 없습니다."

if [[ -e "$DEPLOY_LOCK_DIR" && ( -L "$DEPLOY_LOCK_DIR" || ! -d "$DEPLOY_LOCK_DIR" || ! -O "$DEPLOY_LOCK_DIR" ) ]]; then
  fail "배포 lock 디렉터리의 소유권 또는 형식이 올바르지 않습니다."
fi

umask 077
mkdir -p "$DEPLOY_LOCK_DIR"
chmod 700 "$DEPLOY_LOCK_DIR"

exec 9>"$DEPLOY_LOCK_FILE"
flock -n 9 || fail "다른 Backend 배포가 EC2에서 진행 중입니다."

docker pull "$IMAGE_REFERENCE"
TARGET_IMAGE_ID="$(docker image inspect --format '{{.Id}}' "$IMAGE_REFERENCE")"
tag_candidate_image

if docker container inspect "$ROLLBACK_CONTAINER_NAME" >/dev/null 2>&1; then
  if docker container inspect "$BACKEND_CONTAINER_NAME" >/dev/null 2>&1; then
    CURRENT_IMAGE_ID="$(docker container inspect --format '{{.Image}}' "$BACKEND_CONTAINER_NAME")"
    CURRENT_HEALTH="$(container_health "$BACKEND_CONTAINER_NAME")"

    if [[ "$CURRENT_IMAGE_ID" == "$TARGET_IMAGE_ID" && "$CURRENT_HEALTH" == "healthy" ]]; then
      if ! docker rm "$ROLLBACK_CONTAINER_NAME" >/dev/null; then
        fail "현재 배포는 정상이지만 남아 있는 롤백 컨테이너를 정리하지 못했습니다."
      fi

      finish_success "이미 배포된 정상 이미지 유지" "남은 롤백 컨테이너 정리"
    fi
  fi

  if restore_rollback_container; then
    write_summary "중단된 이전 배포 복구 후 실패" "직전 컨테이너 복구 성공"
  else
    write_summary "중단된 이전 배포 복구 실패" "수동 확인 필요"
  fi

  fail "중단된 이전 배포 흔적을 발견했습니다. 복구 결과를 확인한 뒤 다시 실행해 주세요."
fi

if docker container inspect "$BACKEND_CONTAINER_NAME" >/dev/null 2>&1; then
  CURRENT_IMAGE_ID="$(docker container inspect --format '{{.Image}}' "$BACKEND_CONTAINER_NAME")"
  CURRENT_HEALTH="$(container_health "$BACKEND_CONTAINER_NAME")"

  if [[ "$CURRENT_IMAGE_ID" == "$TARGET_IMAGE_ID" ]]; then
    if [[ "$CURRENT_HEALTH" == "healthy" ]] || wait_for_healthy "$BACKEND_CONTAINER_NAME"; then
      finish_success "이미 배포된 정상 이미지 유지"
    fi

    docker rm --force "$BACKEND_CONTAINER_NAME"
  else
    if [[ "$CURRENT_HEALTH" != "healthy" ]]; then
      fail "현재 운영 컨테이너가 정상 상태가 아니므로 자동 교체하지 않습니다. EC2 상태를 먼저 확인해 주세요."
    fi

    if ! docker rename "$BACKEND_CONTAINER_NAME" "$ROLLBACK_CONTAINER_NAME"; then
      fail "기존 Backend 컨테이너를 롤백용으로 보관하지 못했습니다."
    fi

    if ! docker stop --time 30 "$ROLLBACK_CONTAINER_NAME" >/dev/null; then
      docker rename "$ROLLBACK_CONTAINER_NAME" "$BACKEND_CONTAINER_NAME" >/dev/null 2>&1 || true
      docker start "$BACKEND_CONTAINER_NAME" >/dev/null 2>&1 || true
      fail "기존 Backend 컨테이너를 중지하지 못했습니다."
    fi
  fi
fi

if ! start_container "$IMAGE_REFERENCE"; then
  rollback_and_fail "새 Backend 컨테이너를 시작하지 못했습니다."
fi

if ! wait_for_healthy "$BACKEND_CONTAINER_NAME"; then
  FINAL_HEALTH="$(container_health "$BACKEND_CONTAINER_NAME")"
  rollback_and_fail "Backend liveness 확인에 실패했습니다. 최종 상태: ${FINAL_HEALTH}"
fi

if docker container inspect "$ROLLBACK_CONTAINER_NAME" >/dev/null 2>&1; then
  if ! docker rm "$ROLLBACK_CONTAINER_NAME" >/dev/null; then
    fail "배포는 완료됐지만 롤백 컨테이너를 정리하지 못했습니다."
  fi
fi

finish_success "성공"
