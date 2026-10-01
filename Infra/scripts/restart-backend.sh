#!/usr/bin/env bash
# 급할 때 env만 바꾸고 앱 컨테이너를 같은 이미지(current)로 다시 띄운다. 서버에서 root로 돌린다.
#
#     sudo bash /opt/yeogidam/restart-backend.sh
#
# 평소에는 쓰지 않는다. 배포 워크플로(gh workflow run backend-cd.yml --ref <브랜치>)가 env 해시를
# 보고 컨테이너를 교체하면서 헬스 체크와 롤백까지 해 준다. 이 스크립트는 그 길이 막혔을 때
# (워크플로가 안 돌거나 당장 띄워야 할 때) 쓰는 비상용이라 헬스 체크만 하고 롤백은 없다.
#
# 배포 워크플로가 도는 중에는 돌리지 않는다. 이 스크립트는 deploy.sh의 flock을 잡지 않아서
# 둘이 동시에 돌면 서로의 컨테이너를 걷어낸다. Actions에서 Backend CD가 끝난 것을 보고 돌린다.
#
# 옵션은 Backend/scripts/deploy.sh의 start_container와 같아야 한다. 그쪽이 바뀌면 여기도 고친다.
# env 해시 라벨을 같이 붙이므로, 다음 배포가 "env가 같다"고 알아보고 불필요하게 교체하지 않는다.
# 메모리 상한은 backend-cd.yml의 기본값(512m / 768m)을 그대로 쓴다. repository variable로 바꾼
# 값은 모르므로, 기본값과 다르게 운영 중이면 아래 두 줄을 맞춘다.

set -euo pipefail

ENV_FILE=/opt/yeogidam/backend.env
NAME=yeogidam-backend
IMAGE=yeogidam/backend:current
MEMORY_LIMIT=512m
MEMORY_SWAP_LIMIT=768m

log()  { printf '[restart-backend] %s\n' "$*"; }
fail() { printf '[restart-backend] 오류: %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || fail "sudo로 실행해 주세요."
[ -r "$ENV_FILE" ] || fail "env 파일이 없거나 읽을 수 없습니다: $ENV_FILE"

# 로그 그룹 이름은 프로필에서 나온다(deploy.sh와 같은 규칙). dev, prod 외의 값이면 그룹이 없어
# awslogs 드라이버가 컨테이너를 못 띄우므로 먼저 거른다.
PROFILE="$(grep -E '^SPRING_PROFILES_ACTIVE=' "$ENV_FILE" | tail -n 1 | cut -d= -f2 || true)"
[[ "$PROFILE" =~ ^(dev|prod)$ ]] || fail "SPRING_PROFILES_ACTIVE가 dev나 prod가 아닙니다: '$PROFILE'"
docker image inspect "$IMAGE" >/dev/null 2>&1 || fail "이미지 $IMAGE 가 없습니다. 배포가 한 번은 돌았어야 합니다."

ENV_SHA="$(sha256sum "$ENV_FILE" | awk '{ print $1 }')"
log "프로필 $PROFILE, env sha256 ${ENV_SHA:0:8}, 이미지 $(docker image inspect "$IMAGE" --format '{{.Id}}' | cut -c8-19)"

# 지난 배포가 중간에 끊겨 남은 롤백 컨테이너도 같이 치운다. 남겨 두면 다음 배포가 그것을
# "중단된 배포 흔적"으로 보고 지금 띄우는 컨테이너를 옛것으로 되돌린 뒤 실패한다.
docker rm -f "$NAME" "${NAME}-rollback" >/dev/null 2>&1 || true

docker run --detach \
  --name "$NAME" \
  --restart unless-stopped \
  --env-file "$ENV_FILE" \
  --label "yeogidam.env-sha256=${ENV_SHA}" \
  --publish 127.0.0.1:8080:8080 \
  --memory "$MEMORY_LIMIT" \
  --memory-swap "$MEMORY_SWAP_LIMIT" \
  --log-driver awslogs \
  --log-opt awslogs-region=ap-northeast-2 \
  --log-opt "awslogs-group=/yeogidam/${PROFILE}/backend" \
  --log-opt awslogs-stream=backend \
  --log-opt cache-max-size=10m \
  --log-opt cache-max-file=3 \
  --pull never \
  "$IMAGE" >/dev/null

# 이미지의 HEALTHCHECK가 30초 간격이라 healthy까지 보통 30~60초다. 최대 150초 기다린다.
for _ in $(seq 1 30); do
  STATUS="$(docker inspect "$NAME" --format '{{.State.Health.Status}}')"
  log "$(date +%T) $STATUS"
  [[ "$STATUS" == healthy ]] && { log "완료"; exit 0; }
  [[ "$STATUS" == unhealthy ]] && break
  sleep 5
done

log "healthy가 되지 않았습니다. 최근 로그:"
docker logs --tail 30 "$NAME"
exit 1
