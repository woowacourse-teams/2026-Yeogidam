#!/usr/bin/env bash

set -Eeuo pipefail

readonly CONTAINER_PORT="8080"
readonly DEPLOY_LOCK_DIR="/tmp/yeogidam-deploy-${UID}"
readonly DEPLOY_LOCK_FILE="${DEPLOY_LOCK_DIR}/backend.lock"

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
  local deadline=$((SECONDS + HEALTH_TIMEOUT_SECONDS))
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

start_container() {
  local image="$1"

  docker run --detach \
    --name "$BACKEND_CONTAINER_NAME" \
    --restart unless-stopped \
    --env-file "$BACKEND_ENV_FILE" \
    --publish "${BACKEND_BIND_ADDRESS}:${BACKEND_HOST_PORT}:${CONTAINER_PORT}" \
    --pull never \
    "$image" >/dev/null
}

write_summary() {
  local result="$1"
  local rollback_result="${2:-해당 없음}"

  if [[ -z "${GITHUB_STEP_SUMMARY:-}" ]]; then
    return
  fi

  {
    printf '## Backend 운영 배포\n\n'
    printf -- "- Git SHA: \`%s\`\n" "${GITHUB_SHA:-unknown}"
    printf -- "- 이미지: \`%s\`\n" "$IMAGE_REFERENCE"
    printf -- "- 컨테이너: \`%s\`\n" "$BACKEND_CONTAINER_NAME"
    printf -- "- 포트: \`%s:%s\`\n" "$BACKEND_BIND_ADDRESS" "$BACKEND_HOST_PORT"
    printf -- "- 결과: \`%s\`\n" "$result"
    printf -- "- 롤백: \`%s\`\n" "$rollback_result"
  } >> "$GITHUB_STEP_SUMMARY"
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

  wait_for_healthy "$BACKEND_CONTAINER_NAME"
}

rollback_and_fail() {
  local reason="$1"
  local rollback_result

  printf '::error::%s\n' "$reason"
  docker rm --force "$BACKEND_CONTAINER_NAME" >/dev/null 2>&1 || true

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
require_value "BACKEND_BIND_ADDRESS" "${BACKEND_BIND_ADDRESS:-}"
require_value "BACKEND_HEALTH_TIMEOUT_SECONDS" "${BACKEND_HEALTH_TIMEOUT_SECONDS:-}"

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

if [[ "$BACKEND_ENV_FILE" != /* || ! -f "$BACKEND_ENV_FILE" ]]; then
  fail "BACKEND_ENV_FILE은 EC2에 존재하는 파일의 절대경로여야 합니다."
fi

if [[ ! "$BACKEND_CONTAINER_NAME" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]*$ ]]; then
  fail "BACKEND_CONTAINER_NAME 형식이 올바르지 않습니다."
fi

case "$BACKEND_BIND_ADDRESS" in
  127.0.0.1|0.0.0.0) ;;
  *) fail "BACKEND_BIND_ADDRESS는 127.0.0.1 또는 0.0.0.0이어야 합니다." ;;
esac

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

if docker container inspect "$ROLLBACK_CONTAINER_NAME" >/dev/null 2>&1; then
  if docker container inspect "$BACKEND_CONTAINER_NAME" >/dev/null 2>&1; then
    CURRENT_IMAGE_ID="$(docker container inspect --format '{{.Image}}' "$BACKEND_CONTAINER_NAME")"
    CURRENT_HEALTH="$(container_health "$BACKEND_CONTAINER_NAME")"

    if [[ "$CURRENT_IMAGE_ID" == "$TARGET_IMAGE_ID" && "$CURRENT_HEALTH" == "healthy" ]]; then
      if ! docker rm "$ROLLBACK_CONTAINER_NAME" >/dev/null; then
        fail "현재 배포는 정상이지만 남아 있는 롤백 컨테이너를 정리하지 못했습니다."
      fi

      write_summary "이미 배포된 정상 이미지 유지" "남은 롤백 컨테이너 정리"
      exit 0
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
      write_summary "이미 배포된 정상 이미지 유지"
      exit 0
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

write_summary "성공"
