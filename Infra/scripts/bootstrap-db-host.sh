#!/usr/bin/env bash
# 여기담 개발 DB 서버(yeogidam-dev-db)가 느린 쿼리와 에러와 자원 지표를 CloudWatch로 보내게
# 만들 때 관리자가 직접 돌린다.
#
#     sudo ENV_NAME=dev bash Infra/scripts/bootstrap-db-host.sh
#
# 하는 일은 두 가지다. MySQL 컨테이너에 slow 로그와 error 로그 설정(Infra/mysql/observability.cnf)을
# 넣고, CloudWatch 에이전트를 깔아 그 두 로그와 메모리, 디스크 지표를 보내게 한다.
# 두 번 돌려도 안전하다. 설정 파일이 이미 같으면 컨테이너를 건드리지 않고, 에이전트도 같은
# 설정으로 돌고 있으면 건너뛴다.
#
# 설정이 바뀌어 컨테이너를 재시작하면 개발 DB가 멈춘다. mysqld 종료와 기동을 합쳐 보통 10초 안팎이고,
# 종료 대기 상한 60초와 기동 대기 상한 60초를 다 써도 2분을 넘지 않는다. 그동안 앱은 DB 오류를 내고
# 커넥션 풀이 다시 붙으면 돌아온다. 개발 서버라 그대로 하지만 팀이 쓰는 시간은 피한다. 기동 대기 안에
# mysqld가 접속을 받지 못하면 error.log 경로를 알리고 멈춘다.
#
# MySQL 컨테이너 자체는 이 스크립트가 만들지 않는다. 2026-09-29에 손으로 띄운 것이 있어야
# 한다(컨테이너 yeogidam-mysql, 호스트 /opt/yeogidam/mysql-conf가 /etc/mysql/conf.d로 바인드,
# 데이터는 볼륨 yeogidam-mysql-data). 이름이 다르면 MYSQL_CONTAINER_NAME과 MYSQL_CONF_DIR로
# 바꿀 수 있는데, 에이전트가 읽는 로그 경로는 Infra/cloudwatch/agent-db.json.template에
# 볼륨 이름으로 박혀 있으니 볼륨 이름이 다르면 그 파일도 고친다.
#
# 운영 DB는 RDS로 갈 예정이라 이 스크립트는 개발 서버 전용이고 ENV_NAME은 dev만 받는다. 앱 서버와
# 같은 규칙으로 prod까지 받게 두면 실수로 prod로 돌렸을 때 에이전트가 콘솔에 없는 /yeogidam/prod/mysql
# 그룹을 태그 없이 만들어 버리는데, 우리는 그 그룹을 지울 권한이 없어 관리자에게 부탁해야 한다.
# 운영 DB를 EC2에 두게 되어 prod가 필요해지면 콘솔에 그 그룹을 태그와 함께 먼저 만든 뒤 아래 case에
# prod를 더한다. ENV_NAME을 변수로 남겨 둔 이유는 템플릿과 앱 서버 스크립트가 같은 이름을 쓰기 때문이다.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CNF_SOURCE="$REPO_ROOT/Infra/mysql/observability.cnf"
CW_TEMPLATE="$REPO_ROOT/Infra/cloudwatch/agent-db.json.template"
CW_CONFIG=/opt/aws/amazon-cloudwatch-agent/etc/config.json
CW_CTL=/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl
MYSQL_CONTAINER_NAME="${MYSQL_CONTAINER_NAME:-yeogidam-mysql}"
MYSQL_CONF_DIR="${MYSQL_CONF_DIR:-/opt/yeogidam/mysql-conf}"
MYSQL_LOG_DIR=/var/lib/docker/volumes/yeogidam-mysql-data/_data
# 재시작할 때 mysqld 종료를 기다리는 상한과, 재시작 뒤 접속을 받을 때까지 기다리는 상한(초).
# 값을 이렇게 잡은 이유는 install_mysql_conf와 wait_for_mysql 주석에 있다.
MYSQL_STOP_TIMEOUT=60
MYSQL_START_TIMEOUT=60

log()  { printf '[bootstrap-db-host] %s\n' "$*"; }
fail() { printf '[bootstrap-db-host] 오류: %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || fail "sudo로 실행해 주세요."
[ -n "${ENV_NAME:-}" ] || fail "ENV_NAME이 비어 있습니다. 개발 DB 서버는 dev입니다."
case "$ENV_NAME" in
  dev) ;;
  *) fail "이 스크립트는 개발 DB 전용이라 ENV_NAME은 dev만 받습니다(운영 DB는 RDS로 갑니다). 지금 값은 ${ENV_NAME}입니다." ;;
esac
[ -f "$CNF_SOURCE" ] || fail "설정 원본이 없습니다: $CNF_SOURCE"
[ -f "$CW_TEMPLATE" ] || fail "템플릿이 없습니다: $CW_TEMPLATE"
command -v docker >/dev/null 2>&1 || fail "docker가 없습니다."
docker container inspect "$MYSQL_CONTAINER_NAME" >/dev/null 2>&1 \
  || fail "컨테이너 $MYSQL_CONTAINER_NAME 이 없습니다. MySQL 컨테이너를 먼저 띄워 주세요."
[ -d "$MYSQL_LOG_DIR" ] \
  || fail "데이터 볼륨 경로가 없습니다: $MYSQL_LOG_DIR (볼륨 이름이 yeogidam-mysql-data가 맞는지 docker volume ls로 확인)"

install_packages() {
  # gettext는 envsubst 때문에 필요하다. 에이전트는 AL2023 저장소에 있다.
  dnf install -y -q gettext amazon-cloudwatch-agent
}

# 설정 파일을 conf.d 바인드 폴더에 넣는다. mysqld는 시작할 때만 conf.d를 읽으므로 내용이
# 달라졌을 때만 컨테이너를 재시작한다. 같으면 DB를 멈출 이유가 없다.
install_mysql_conf() {
  local target="$MYSQL_CONF_DIR/observability.cnf"
  if cmp -s "$CNF_SOURCE" "$target" 2>/dev/null; then
    log "MySQL 설정 이미 같음: $target"
    return 0
  fi
  mkdir -p "$MYSQL_CONF_DIR"
  # mysqld는 아무나 쓸 수 있는 설정 파일을 경고만 내고 무시하므로 644로 둔다.
  install -m 644 "$CNF_SOURCE" "$target"
  log "MySQL 설정 복사됨: $target. 컨테이너를 재시작합니다(개발 DB가 보통 10초 안팎 멈춤)."
  # docker restart는 SIGTERM을 보내고 기본 10초 뒤 SIGKILL을 보낸다. mysql:8.4 이미지는 STOPSIGNAL을
  # 따로 정하지 않아 그대로 적용되는데, InnoDB가 더티 페이지를 다 쓰기 전에 죽으면 다음 기동이
  # 크래시 복구로 시작한다. 그래서 종료 대기를 넉넉히 준다. 보통은 몇 초 만에 끝나서 상한을 다 쓰는
  # 일은 없다. -t는 옛 도커의 --time과 새 도커의 --timeout 양쪽에서 같은 뜻이라 짧은 꼴을 쓴다.
  docker restart -t "$MYSQL_STOP_TIMEOUT" "$MYSQL_CONTAINER_NAME" >/dev/null
  wait_for_mysql
}

show_container_status() {
  docker ps --all --filter "name=^${MYSQL_CONTAINER_NAME}\$" --format 'table {{.Names}}\t{{.Status}}'
}

# docker restart는 컨테이너 프로세스가 뜨자마자 돌아오고, 공식 mysql 이미지의 entrypoint는 그 뒤에야
# mysqld --verbose --help로 설정을 검사해 틀리면 종료한다. 그래서 restart 직후의 Running 값은
# 설정이 맞는지 말해 주지 않고, mysqld가 실제로 접속을 받을 때까지 mysqladmin ping으로 기다린다.
# ping은 서버가 떠 있기만 하면 Access denied여도 종료 코드가 0이라 비밀번호 없이 쓸 수 있다.
# 컨테이너가 --restart unless-stopped라 설정이 틀리면 재시작을 반복하는데, 그때는 RestartCount가
# 커지므로 ping과 별개로 그 값이 늘어도 실패로 본다. 기준값은 restart가 돌아온 직후에 읽는다.
# 도커가 restart 때 이 값을 0으로 되돌리든 아니든 그 뒤에 늘어난 만큼만 보면 되기 때문이다.
wait_for_mysql() {
  local baseline restarts waited=0
  baseline="$(docker container inspect --format '{{.RestartCount}}' "$MYSQL_CONTAINER_NAME")"
  while [ "$waited" -lt "$MYSQL_START_TIMEOUT" ]; do
    restarts="$(docker container inspect --format '{{.RestartCount}}' "$MYSQL_CONTAINER_NAME")"
    if [ "$restarts" -gt "$baseline" ]; then
      show_container_status
      fail "mysqld가 죽어 컨테이너가 재시작을 반복합니다. 설정이 틀렸을 가능성이 크니 $MYSQL_LOG_DIR/error.log 를 확인해 주세요."
    fi
    if docker exec "$MYSQL_CONTAINER_NAME" mysqladmin ping --silent >/dev/null 2>&1; then
      show_container_status
      log "mysqld가 접속을 받습니다(재시작 뒤 ${waited}초)."
      return 0
    fi
    sleep 2
    waited=$((waited + 2))
  done
  show_container_status
  # log_error를 파일로 돌렸으므로 설정이 틀려 mysqld가 못 뜨면 docker logs가 아니라
  # 볼륨의 error.log에 이유가 남는다.
  fail "재시작 뒤 ${MYSQL_START_TIMEOUT}초 안에 mysqld가 접속을 받지 못했습니다. $MYSQL_LOG_DIR/error.log 와 docker logs $MYSQL_CONTAINER_NAME 을 확인해 주세요."
}

# slow.log와 error.log와 메모리, 디스크 지표를 CloudWatch로 보낸다. 로그 그룹은 콘솔에서 태그를
# 달아 미리 만들어 둔 것(/yeogidam/<ENV_NAME>/mysql)만 쓰고 여기서 만들지 않는다. 자세한 이유와
# envsubst에 목록을 주는 이유는 bootstrap-host.sh의 같은 함수에 적혀 있다. 고칠 때 둘 다 고친다.
install_cloudwatch_agent() {
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
  "$CW_CTL" -a fetch-config -m ec2 -s -c "file:$CW_CONFIG"
  systemctl enable amazon-cloudwatch-agent >/dev/null 2>&1
  log "CloudWatch 에이전트 적용됨: 로그 /yeogidam/$ENV_NAME/mysql, 지표 Yeogidam/$ENV_NAME"
}

main() {
  install_packages
  install_mysql_conf
  install_cloudwatch_agent
  log "끝. ls -l $MYSQL_LOG_DIR/slow.log $MYSQL_LOG_DIR/error.log 로 파일이 생겼는지 보고,"
  log "/opt/aws/amazon-cloudwatch-agent/logs/amazon-cloudwatch-agent.log 에 오류가 없으면 된 것입니다."
}

main "$@"
