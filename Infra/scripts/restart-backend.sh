#!/usr/bin/env bash
# 서버의 env만 바꿨을 때, 또는 직전 이미지로 되돌릴 때 앱을 블루그린으로 다시 띄운다. 서버에서 root로 돌린다.
#
#     sudo bash /opt/yeogidam/restart-backend.sh            # env 변경 반영(current 이미지)
#     sudo bash /opt/yeogidam/restart-backend.sh previous   # 롤백(previous 이미지)
#
# --env-file은 컨테이너를 만들 때만 읽히고, deploy.sh는 같은 이미지면 컨테이너를 그대로 두므로
# env 변경은 배포를 다시 돌려도 반영되지 않는다. 그래서 env를 고친 뒤에는 이 스크립트로 다시 띄운다.
#
# 순서는 deploy.sh와 같다. nginx가 가리키지 않는 칸(블루 8080, 그린 8081 중 하나)에 이미지를 띄우고,
# liveness가 통과하면 nginx를 그쪽으로 돌린 뒤, 옛 컨테이너의 분석 작업이 끝나면 내린다. 새 컨테이너가
# 뜨지 않으면 nginx를 건드리지 않으므로 요청은 옛 컨테이너가 계속 받는다. 롤백이면 current와 previous
# 태그를 맞바꿔서, 다음 롤백이 다시 앞 버전으로 가고 다음 배포의 정리가 두 이미지를 지우지 않게 한다.
# 시작, 전환, 완료 시각을 한국 시간으로 찍으므로 롤백 기록에 그대로 옮기면 된다.
#
# deploy.sh와 같은 lock 파일을 잡으므로 배포 워크플로가 도는 중이면 기다리지 않고 멈춘다.
# 옵션은 Infra/scripts/deploy.sh의 start_container와 같아야 한다. 그쪽이 바뀌면 여기도 고친다.
# 메모리 상한은 backend-cd.yml의 기본값(512m / 768m)을 그대로 쓴다. repository variable로 바꾼
# 값은 모르므로, 기본값과 다르게 운영 중이면 아래 두 줄을 맞춘다.

set -euo pipefail

ROLE="${1:-current}"
ENV_FILE=/opt/yeogidam/backend.env
NAME=yeogidam-backend
IMAGE_NAME=yeogidam/backend
MEMORY_LIMIT=512m
MEMORY_SWAP_LIMIT=768m
BLUE_PORT=8080
GREEN_PORT=8081
UPSTREAM_FILE=/etc/nginx/yeogidam/backend-upstream.conf
SWITCH_COMMAND=/usr/local/sbin/yeogidam-switch-backend
RUNNER_USER=github-runner
POST_SWITCH_CHECK_SECONDS=10
DRAIN_TIMEOUT_SECONDS=120
READY_TIMEOUT_SECONDS=150

log()  { printf '[restart-backend] %s %s\n' "$(TZ=Asia/Seoul date '+%F %T KST')" "$*"; }
fail() { printf '[restart-backend] 오류: %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || fail "sudo로 실행해 주세요."
case "$ROLE" in
  current|previous) ;;
  *) fail "인자는 current(env 반영)나 previous(롤백)만 받습니다. 지금 값은 ${ROLE}입니다." ;;
esac
[ -r "$ENV_FILE" ] || fail "env 파일이 없거나 읽을 수 없습니다: $ENV_FILE"
[ -r "$UPSTREAM_FILE" ] || fail "nginx 블루그린 설정 ${UPSTREAM_FILE}이 없습니다. Infra/scripts/bootstrap-host.sh를 먼저 다시 돌려 주세요."
[ -x "$SWITCH_COMMAND" ] || fail "전환 스크립트 ${SWITCH_COMMAND}가 없습니다. Infra/scripts/bootstrap-host.sh를 먼저 다시 돌려 주세요."
command -v curl >/dev/null 2>&1 || fail "curl이 없습니다."
command -v flock >/dev/null 2>&1 || fail "flock이 없습니다."

# 로그 그룹 이름은 프로필에서 나온다(deploy.sh와 같은 규칙). dev, prod 외의 값이면 그룹이 없어
# awslogs 드라이버가 컨테이너를 못 띄우므로 먼저 거른다.
PROFILE="$(grep -E '^SPRING_PROFILES_ACTIVE=' "$ENV_FILE" | tail -n 1 | cut -d= -f2 || true)"
[[ "$PROFILE" =~ ^(dev|prod)$ ]] || fail "SPRING_PROFILES_ACTIVE가 dev나 prod가 아닙니다: '$PROFILE'"

# current 이미지는 Flyway 전용 계정으로 시작하므로(#412) 두 값이 비어 있으면 앱이 뜨지 못한다.
# 블루그린이라 뜨지 않아도 요청은 끊기지 않지만, 시간을 버리지 않게 deploy.sh와 같은 기준으로 먼저 본다.
for key in FLYWAY_USERNAME FLYWAY_PASSWORD; do
  value="$(grep -E "^${key}=" "$ENV_FILE" | tail -n 1 | cut -d= -f2- || true)"
  [[ -n "${value//[[:space:]]/}" ]] || fail "${ENV_FILE}에 ${key}이 없거나 비어 있습니다."
done

IMAGE="${IMAGE_NAME}:${ROLE}"
docker image inspect "$IMAGE" >/dev/null 2>&1 || fail "이미지 $IMAGE 가 없습니다. 배포가 한 번은 돌았어야 하고, 롤백은 배포가 두 번 돈 뒤에 할 수 있습니다."
IMAGE_ID="$(docker image inspect --format '{{.Id}}' "$IMAGE")"

# deploy.sh는 러너 사용자의 UID로 /tmp/yeogidam-deploy-<UID>/backend.lock을 잡는다. 같은 파일을 잡아야
# 배포와 겹치지 않는다. 디렉터리와 파일이 없으면 러너 소유로 만들어야 deploy.sh의 소유권 검사가 통과한다.
RUNNER_UID="$(id -u "$RUNNER_USER")" || fail "러너 사용자 ${RUNNER_USER}가 없습니다."
LOCK_DIR="/tmp/yeogidam-deploy-${RUNNER_UID}"
LOCK_FILE="${LOCK_DIR}/backend.lock"
[ -d "$LOCK_DIR" ] || install -d -o "$RUNNER_USER" -g "$RUNNER_USER" -m 700 "$LOCK_DIR"
[ -e "$LOCK_FILE" ] || install -o "$RUNNER_USER" -g "$RUNNER_USER" -m 600 /dev/null "$LOCK_FILE"
exec 9>>"$LOCK_FILE"
flock -n 9 || fail "배포 워크플로가 EC2에서 진행 중입니다. Actions에서 Backend CD가 끝난 것을 보고 다시 돌려 주세요."

color_of_port() { if [ "$1" = "$BLUE_PORT" ]; then echo blue; else echo green; fi; }
other_port()    { if [ "$1" = "$BLUE_PORT" ]; then echo "$GREEN_PORT"; else echo "$BLUE_PORT"; fi; }
running()       { [ "$(docker container inspect --format '{{.State.Running}}' "$1" 2>/dev/null || true)" = "true" ]; }
liveness_ok()   { curl --silent --fail --max-time 2 --output /dev/null "http://127.0.0.1:$1/actuator/health/liveness"; }
metric()        {
  curl --silent --fail --max-time 2 "http://127.0.0.1:$1/actuator/metrics/executor.$2?tag=name:mediaExtractionExecutor" 2>/dev/null \
    | grep -oE '"value":[0-9.]+' | head -n 1 | cut -d: -f2 | cut -d. -f1 || true
}

ACTIVE_PORT="$(grep -oE 'server[[:space:]]+127\.0\.0\.1:(8080|8081);' "$UPSTREAM_FILE" | grep -oE '(8080|8081)' | head -n 1 || true)"
[ -n "$ACTIVE_PORT" ] || fail "${UPSTREAM_FILE}에서 앱 포트를 읽지 못했습니다."
IDLE_PORT="$(other_port "$ACTIVE_PORT")"
ACTIVE_NAME="${NAME}-$(color_of_port "$ACTIVE_PORT")"
IDLE_NAME="${NAME}-$(color_of_port "$IDLE_PORT")"

# 블루그린 전 이름(칸 구분 없이 8080)으로 도는 컨테이너가 있으면 그것을 블루로 본다.
docker container inspect "${NAME}-rollback" >/dev/null 2>&1 \
  && fail "블루그린 전 배포 스크립트가 남긴 ${NAME}-rollback이 있습니다. 상태를 확인하고 정리한 뒤 다시 돌려 주세요."
if [ "$ACTIVE_PORT" = "$BLUE_PORT" ] && ! docker container inspect "$ACTIVE_NAME" >/dev/null 2>&1 \
  && docker container inspect "$NAME" >/dev/null 2>&1; then
  ACTIVE_NAME="$NAME"
fi

log "시작: ${ROLE} 이미지 $(echo "$IMAGE_ID" | cut -c8-19), 프로필 ${PROFILE}, 지금 요청 받는 칸 ${ACTIVE_PORT}(${ACTIVE_NAME})"

# 빈 칸에 남은 컨테이너는 요청을 받지 않으므로 지워도 끊기지 않는다.
docker rm -f "$IDLE_NAME" >/dev/null 2>&1 || true
docker run --detach \
  --name "$IDLE_NAME" \
  --restart unless-stopped \
  --env-file "$ENV_FILE" \
  --publish "127.0.0.1:${IDLE_PORT}:8080" \
  --memory "$MEMORY_LIMIT" \
  --memory-swap "$MEMORY_SWAP_LIMIT" \
  --log-driver awslogs \
  --log-opt awslogs-region=ap-northeast-2 \
  --log-opt "awslogs-group=/yeogidam/${PROFILE}/backend" \
  --log-opt "awslogs-stream=backend-$(color_of_port "$IDLE_PORT")" \
  --log-opt cache-max-size=10m \
  --log-opt cache-max-file=3 \
  --pull never \
  "$IMAGE" >/dev/null

ready=""
deadline=$((SECONDS + READY_TIMEOUT_SECONDS))
while ((SECONDS < deadline)); do
  running "$IDLE_NAME" || break
  if liveness_ok "$IDLE_PORT"; then ready=1; break; fi
  sleep 1
done
if [ -z "$ready" ]; then
  log "새 컨테이너가 응답하지 않아 지웁니다. 요청은 ${ACTIVE_PORT} 칸이 계속 받습니다. 최근 로그:"
  docker logs --tail 30 "$IDLE_NAME" 2>&1 || true
  docker rm -f "$IDLE_NAME" >/dev/null 2>&1 || true
  exit 1
fi
log "새 컨테이너 응답 확인: ${IDLE_PORT}(${IDLE_NAME})"

if ! "$SWITCH_COMMAND" "$IDLE_PORT"; then
  docker rm -f "$IDLE_NAME" >/dev/null 2>&1 || true
  fail "nginx를 새 컨테이너로 돌리지 못해 새 컨테이너를 지웠습니다. 요청은 ${ACTIVE_PORT} 칸이 계속 받습니다."
fi
log "전환: nginx ${ACTIVE_PORT} → ${IDLE_PORT}"

deadline=$((SECONDS + POST_SWITCH_CHECK_SECONDS))
while ((SECONDS < deadline)); do
  if ! running "$IDLE_NAME" || ! liveness_ok "$IDLE_PORT"; then
    if running "$ACTIVE_NAME" && liveness_ok "$ACTIVE_PORT"; then
      "$SWITCH_COMMAND" "$ACTIVE_PORT"
      docker rm -f "$IDLE_NAME" >/dev/null 2>&1 || true
      fail "전환 뒤 새 컨테이너가 응답하지 않아 nginx를 ${ACTIVE_PORT} 칸으로 되돌렸습니다."
    fi
    fail "전환 뒤 새 컨테이너가 응답하지 않는데 옛 컨테이너도 없습니다. 컨테이너와 nginx 상태를 확인해 주세요."
  fi
  sleep 1
done

if docker container inspect "$ACTIVE_NAME" >/dev/null 2>&1; then
  if running "$ACTIVE_NAME"; then
    deadline=$((SECONDS + DRAIN_TIMEOUT_SECONDS))
    while ((SECONDS < deadline)); do
      active="$(metric "$ACTIVE_PORT" active)"; queued="$(metric "$ACTIVE_PORT" queued)"
      { [ -z "$active" ] || [ -z "$queued" ]; } && { log "옛 컨테이너 분석 지표를 읽지 못해 바로 내립니다."; break; }
      [ "$active" = "0" ] && [ "$queued" = "0" ] && break
      sleep 2
    done
  fi
  docker stop --time 30 "$ACTIVE_NAME" >/dev/null 2>&1 || log "옛 컨테이너를 멈추지 못했습니다: $ACTIVE_NAME"
  docker rm "$ACTIVE_NAME" >/dev/null 2>&1 || log "옛 컨테이너를 지우지 못했습니다: $ACTIVE_NAME"
fi

# 롤백이면 태그를 맞바꾼다. 지금 도는 이미지가 current, 방금 내린 이미지가 previous가 된다.
if [ "$ROLE" = "previous" ]; then
  OLD_CURRENT_ID="$(docker image inspect --format '{{.Id}}' "${IMAGE_NAME}:current" 2>/dev/null || true)"
  docker tag "$IMAGE_ID" "${IMAGE_NAME}:current"
  [ -z "$OLD_CURRENT_ID" ] || docker tag "$OLD_CURRENT_ID" "${IMAGE_NAME}:previous"
  log "태그 정리: current ← 롤백한 이미지, previous ← 내린 이미지"
fi

log "완료: 이제 ${IDLE_PORT} 칸(${IDLE_NAME})이 요청을 받습니다."
