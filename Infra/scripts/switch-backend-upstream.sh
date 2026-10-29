#!/usr/bin/env bash
# nginx가 요청을 넘기는 앱 포트를 블루(8080)와 그린(8081) 사이에서 바꾼다. 블루그린 배포에서 새 컨테이너가
# liveness를 통과한 뒤 Infra/scripts/deploy.sh와 Infra/scripts/restart-backend.sh가 부른다.
#
#     sudo /usr/local/sbin/yeogidam-switch-backend 8081
#
# bootstrap-host.sh가 이 파일을 /usr/local/sbin/yeogidam-switch-backend(root 소유, 755)로 깔고,
# 러너 사용자가 이 명령을 8080과 8081 두 인자로만 비밀번호 없이 sudo로 부르게 sudoers에 적는다.
# 러너가 nginx 설정을 통째로 바꿀 수 있으면 공개 저장소의 워크플로 하나로 서버 앞단이 바뀌므로,
# 러너가 바꿀 수 있는 것을 upstream 파일의 포트 한 줄로 좁힌다.
#
# 새 파일로 nginx -t가 실패하면 원래 파일로 되돌리고 reload하지 않는다. reload는 새 설정으로 작업
# 프로세스를 새로 띄우고, 옛 작업 프로세스는 처리 중이던 요청을 끝낸 뒤 끝나므로 전환 중에 요청이 끊기지 않는다.

set -euo pipefail

readonly UPSTREAM_DIR=/etc/nginx/yeogidam
readonly UPSTREAM_FILE="$UPSTREAM_DIR/backend-upstream.conf"

log()  { printf '[switch-backend] %s\n' "$*"; }
fail() { printf '[switch-backend] 오류: %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || fail "sudo로 실행해 주세요."
[ "$#" -eq 1 ] || fail "포트 하나만 받습니다. 예: yeogidam-switch-backend 8081"
case "$1" in
  8080|8081) PORT="$1" ;;
  *) fail "포트는 8080(블루)이나 8081(그린)만 받습니다. 지금 값은 $1입니다." ;;
esac

mkdir -p "$UPSTREAM_DIR"
BACKUP=""
if [ -f "$UPSTREAM_FILE" ]; then
  BACKUP="$(mktemp "$UPSTREAM_DIR/.backend-upstream.conf.bak.XXXXXX")"
  cp -p "$UPSTREAM_FILE" "$BACKUP"
fi

# 같은 디렉터리에 먼저 쓰고 mv로 바꿔서, nginx가 반쯤 쓴 파일을 읽는 순간이 없게 한다.
# nginx.conf는 이 파일 하나만 include하므로 이름이 점으로 시작하는 임시 파일은 읽히지 않는다.
STAGED="$(mktemp "$UPSTREAM_DIR/.backend-upstream.conf.new.XXXXXX")"
cat > "$STAGED" <<CONF
# yeogidam-switch-backend가 만든 파일이다. 손으로 고치지 않는다. 바꾼 시각 $(date -u +%FT%TZ)
upstream yeogidam_backend {
    server 127.0.0.1:${PORT};
}
CONF
chmod 644 "$STAGED"
mv -f "$STAGED" "$UPSTREAM_FILE"

if ! nginx -t >/dev/null 2>&1; then
  if [ -n "$BACKUP" ]; then
    mv -f "$BACKUP" "$UPSTREAM_FILE"
  else
    rm -f "$UPSTREAM_FILE"
  fi
  nginx -t || true
  fail "nginx 설정 검사에 실패해 원래 파일로 되돌렸습니다. reload하지 않았습니다."
fi
[ -z "$BACKUP" ] || rm -f "$BACKUP"

systemctl reload nginx
log "전환 완료: 이제 127.0.0.1:${PORT}이 요청을 받습니다."
