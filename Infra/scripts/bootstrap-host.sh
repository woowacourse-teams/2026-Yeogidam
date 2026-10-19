#!/usr/bin/env bash
# 여기담 배포 서버를 처음 준비할 때 서버당 한 번, 관리자가 직접 돌린다.
#
#     sudo SERVER_NAME=<도메인> CERT_EMAIL=<메일> ENV_NAME=<dev|prod> bash Infra/scripts/bootstrap-host.sh
#
# 하는 일은 다섯 가지다. nginx를 깔고, certbot을 깔고, 인증서를 받고, 갱신 타이머를 걸고,
# CloudWatch 에이전트를 깔아 nginx 로그와 메모리, 디스크 지표를 보내게 한다.
# 두 번 돌려도 안전하다. 이미 끝난 단계는 건너뛴다. 서버가 늘면 이 파일만 다시 돌리면 된다.
#
# 앱 컨테이너는 이 스크립트가 다루지 않는다. CD 워크플로가 Backend/scripts/deploy.sh로 한다.
# 개발 DB 서버는 Infra/scripts/bootstrap-db-host.sh가 따로 맡는다.
#
# 도메인과 메일은 공개 저장소에 적지 않으려고 환경변수로 받는다. 비어 있으면 아무것도
# 만들지 않고 멈춘다. 서버 안에서 이 값이 필요한 곳은 nginx 설정과 certbot뿐이다.
# ENV_NAME은 CloudWatch 로그 그룹(/yeogidam/<ENV_NAME>/nginx)과 지표 네임스페이스
# (Yeogidam/<ENV_NAME>) 이름에 들어간다. 콘솔에 미리 만들어 둔 그룹 이름과 맞아야 하므로
# dev와 prod만 받는다.
#
# AL2023 기준이다. certbot이 dnf에 없어서 pip venv로 깔고, 그래서 갱신 타이머도
# 패키지가 안 만들어 주므로 여기서 직접 만든다.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEMPLATE="$REPO_ROOT/Infra/nginx/nginx.conf.template"
NGINX_CONF=/etc/nginx/nginx.conf
CERTBOT_DIR=/opt/certbot
CERTBOT="$CERTBOT_DIR/bin/certbot"
WEBROOT=/var/www/certbot
CW_TEMPLATE="$REPO_ROOT/Infra/cloudwatch/agent-app.json.template"
CW_CONFIG=/opt/aws/amazon-cloudwatch-agent/etc/config.json
CW_CTL=/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl

log()  { printf '[bootstrap-host] %s\n' "$*"; }
fail() { printf '[bootstrap-host] 오류: %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || fail "sudo로 실행해 주세요."
[ -n "${SERVER_NAME:-}" ] || fail "SERVER_NAME이 비어 있습니다. 예: SERVER_NAME=yeogidam-dev.duckdns.org"
[ -n "${CERT_EMAIL:-}" ]  || fail "CERT_EMAIL이 비어 있습니다. Let's Encrypt 만료 알림을 받을 주소입니다."
[ -n "${ENV_NAME:-}" ]    || fail "ENV_NAME이 비어 있습니다. 개발 서버는 dev, 운영 서버는 prod입니다."
case "$ENV_NAME" in
  dev|prod) ;;
  *) fail "ENV_NAME은 dev 또는 prod여야 합니다. 지금 값은 ${ENV_NAME}입니다." ;;
esac
[ -f "$TEMPLATE" ] || fail "템플릿이 없습니다: $TEMPLATE"
[ -f "$CW_TEMPLATE" ] || fail "템플릿이 없습니다: $CW_TEMPLATE"

install_packages() {
  # gettext는 envsubst 때문에, python3는 certbot 때문에, git은 배포 잡이 원격 HEAD를
  # git ls-remote로 대조하기 때문에 필요하다. git이 없으면 첫 배포가 그 단계에서 멈춘다.
  dnf install -y -q nginx gettext python3 python3-pip git
  # 배포판이 준 원본 설정은 한 번만 보관해 둔다. 되돌릴 때 쓴다.
  [ -f "$NGINX_CONF.dist" ] || cp "$NGINX_CONF" "$NGINX_CONF.dist"
  # SELinux가 켜져 있으면 nginx가 127.0.0.1:8080으로 붙는 것을 막는다. 꺼져 있으면 무시된다.
  setsebool -P httpd_can_network_connect 1 2>/dev/null || true
  log "nginx $(nginx -v 2>&1 | sed 's#.*/##') 설치됨"
}

install_certbot() {
  if [ -x "$CERTBOT" ]; then
    log "certbot 이미 있음: $("$CERTBOT" --version 2>&1)"
    return 0
  fi
  python3 -m venv "$CERTBOT_DIR"
  "$CERTBOT_DIR/bin/pip" install -q --upgrade pip
  "$CERTBOT_DIR/bin/pip" install -q certbot
  ln -sf "$CERTBOT" /usr/local/bin/certbot
  log "certbot 설치됨: $("$CERTBOT" --version 2>&1)"
}

# 인증서가 아직 없을 때만 쓰는 임시 설정이다. 443 블록이 인증서 파일을 가리키므로
# 파일이 생기기 전에는 nginx -t가 실패한다. 그래서 80만 열어 발급 검증 경로를 받는다.
render_http_only() {
  cat > "$NGINX_CONF" <<EOF
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /run/nginx.pid;
events { worker_connections 1024; }
http {
    server_tokens off;
    server {
        listen 80;
        server_name ${SERVER_NAME};
        location ^~ /.well-known/acme-challenge/ { root ${WEBROOT}; }
        location / { return 404; }
    }
}
EOF
}

# 템플릿에서 \${SERVER_NAME}만 바꾼다. envsubst에 목록을 주지 않으면 nginx 자체 변수
# (\$host, \$request_uri 등)까지 빈칸으로 바꿔 버린다.
render_full() {
  SERVER_NAME="$SERVER_NAME" envsubst '${SERVER_NAME}' < "$TEMPLATE" > "$NGINX_CONF"
}

apply_nginx() {
  nginx -t
  systemctl enable nginx >/dev/null 2>&1
  if systemctl is-active --quiet nginx; then
    systemctl reload nginx
  else
    systemctl start nginx
  fi
}

obtain_cert() {
  if [ -s "/etc/letsencrypt/live/$SERVER_NAME/fullchain.pem" ]; then
    log "인증서 이미 있음: /etc/letsencrypt/live/$SERVER_NAME"
    return 0
  fi
  mkdir -p "$WEBROOT"
  render_http_only
  apply_nginx
  "$CERTBOT" certonly --webroot -w "$WEBROOT" -d "$SERVER_NAME" \
    --email "$CERT_EMAIL" --agree-tos --no-eff-email --non-interactive
  log "인증서 발급됨: /etc/letsencrypt/live/$SERVER_NAME"
}

# 하루 두 번 만료를 확인하고, 실제로 갱신됐을 때만 nginx를 reload한다. 앱은 건드리지 않는다.
install_renewal() {
  cat > /etc/systemd/system/certbot-renew.service <<EOF
[Unit]
Description=Let's Encrypt 인증서 갱신

[Service]
Type=oneshot
ExecStart=$CERTBOT renew --quiet --deploy-hook "systemctl reload nginx"
EOF
  cat > /etc/systemd/system/certbot-renew.timer <<'EOF'
[Unit]
Description=certbot-renew를 하루 두 번 돌린다

[Timer]
OnCalendar=*-*-* 03,15:00:00
RandomizedDelaySec=1h
Persistent=true

[Install]
WantedBy=timers.target
EOF
  systemctl daemon-reload
  systemctl enable --now certbot-renew.timer >/dev/null 2>&1
  log "갱신 타이머 등록됨 (certbot-renew.timer)"
}

# nginx 로그 두 파일과 메모리, 디스크 지표를 CloudWatch로 보낸다. 지표는 개당 과금이라 두 개만 보낸다.
#
# 로그 그룹은 콘솔에서 태그를 달아 미리 만들어 둔 것만 쓴다. 우테코 공용 계정은 태그 없는 리소스를
# 관리자가 지우는데, 에이전트는 없는 그룹을 만나면 태그 없이 만들어 버린다. 그래서 템플릿의 그룹
# 이름이 콘솔의 이름과 한 글자라도 다르면 안 되고, 여기서 그룹을 만드는 일도 없다.
#
# 템플릿에서 \${ENV_NAME}만 바꾼다. envsubst는 셸 변수 이름 꼴(\${ENV_NAME})만 치환하므로 에이전트
# 자체 문법인 \${aws:InstanceId}는 목록이 없어도 건드리지 않지만, 앞으로 템플릿에 다른 \$이름이
# 들어가도 ENV_NAME만 바뀌도록 목록을 준다. 렌더 결과가 지금 설정과 같고 에이전트가 이미 돌고
# 있으면 건너뛴다. 같은 함수가 bootstrap-db-host.sh에도 있으니 고칠 때 둘 다 고친다.
install_cloudwatch_agent() {
  dnf install -y -q amazon-cloudwatch-agent
  local rendered
  rendered="$(mktemp)"
  ENV_NAME="$ENV_NAME" envsubst '${ENV_NAME}' < "$CW_TEMPLATE" > "$rendered"
  if cmp -s "$rendered" "$CW_CONFIG" 2>/dev/null && systemctl is-active --quiet amazon-cloudwatch-agent; then
    rm -f "$rendered"
    log "CloudWatch 에이전트 이미 같은 설정으로 실행 중"
    return 0
  fi
  install -m 644 "$rendered" "$CW_CONFIG"
  rm -f "$rendered"
  # fetch-config가 JSON을 에이전트 내부 형식으로 바꾸고, -s가 에이전트를 (재)시작한다.
  "$CW_CTL" -a fetch-config -m ec2 -s -c "file:$CW_CONFIG"
  systemctl enable amazon-cloudwatch-agent >/dev/null 2>&1
  log "CloudWatch 에이전트 적용됨: 로그 /yeogidam/$ENV_NAME/nginx, 지표 Yeogidam/$ENV_NAME"
}

main() {
  install_packages
  install_certbot
  obtain_cert
  render_full
  apply_nginx
  install_renewal
  install_cloudwatch_agent
  log "끝. curl -I https://$SERVER_NAME 으로 확인해 보세요."
  log "에이전트는 /opt/aws/amazon-cloudwatch-agent/logs/amazon-cloudwatch-agent.log 에 오류가 없고 콘솔 로그 그룹에 스트림이 생기면 된 것입니다."
}

main "$@"
