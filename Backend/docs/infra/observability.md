# 운영 관찰과 대응

스프린트 1 요구사항 「운영 관찰과 대응」을 CloudWatch로 채운다. 서버가 무엇을 어디로 보내는지, 서버와 콘솔에서 각각 무엇을 해야 하는지, 알람이 울리면 무엇을 남기는지 적는다. 서버 쪽 스크립트와 설정은 저장소에 있고, 콘솔에서 만드는 것(지표 필터, 알람, 대시보드, SNS, Lambda)은 사람이 손으로 만든다. 콘솔 절차를 여기에 적는 이유는 우테코 공용 계정이라 IaC 도구를 붙일 권한이 없고, 누가 어떤 이름으로 무엇을 만들었는지 저장소에 남겨야 다음 사람이 같은 것을 또 만들지 않기 때문이다.

마지막 갱신 2026-10-02.

## 무엇을 어디로 보내는가

| 대상 | 보내는 방법 | 로그 그룹 또는 네임스페이스 | 스트림 또는 지표 |
| --- | --- | --- | --- |
| 앱 컨테이너 stdout(JSON 한 줄) | 도커 `awslogs` 드라이버 (`Backend/scripts/deploy.sh`) | `/yeogidam/<env>/backend` | `backend` |
| nginx access, error | CloudWatch 에이전트 (`Infra/cloudwatch/agent-app.json.template`) | `/yeogidam/<env>/nginx` | `access`, `error` |
| MySQL slow, error (dev만) | CloudWatch 에이전트 (`Infra/cloudwatch/agent-db.json.template`) | `/yeogidam/dev/mysql` | `slow`, `error` |
| 메모리, 디스크 사용률 (서버 3대) | CloudWatch 에이전트 | `Yeogidam/<env>` | `mem_used_percent`(차원 `InstanceId`), `disk_used_percent`(차원 `InstanceId`, `path`, `fstype`) |
| RDS error, slowquery (prod) | RDS 로그 내보내기 (인스턴스 설정, 2026-10-02) | `/aws/rds/instance/yeogidam-prod-db/error`, `/aws/rds/instance/yeogidam-prod-db/slowquery` | `yeogidam-prod-db` |
| RDS CPU, 연결 수, 남은 저장 공간, 남은 메모리 | RDS 기본 지표 (무료, 1분) | `AWS/RDS` | `CPUUtilization`, `DatabaseConnections`, `FreeStorageSpace`, `FreeableMemory` (차원 `DBInstanceIdentifier`) |

`<env>`는 `dev` 또는 `prod`다. 앱은 `SPRING_PROFILES_ACTIVE`의 프로필 이름이, 에이전트는 부트스트랩 스크립트에 넘기는 `ENV_NAME`이 이 자리에 들어간다. 두 이름이 같아서 `deploy.sh`는 환경 변수를 따로 받지 않고 검증을 마친 `EXPECTED_SPRING_PROFILE`로 그룹 이름을 만든다. 변수를 하나 더 두면 두 값이 어긋났을 때 로그가 엉뚱한 환경의 그룹으로 간다.

**앱 로그는 에이전트가 아니라 도커가 보낸다.** 앱은 dev와 prod 프로필에서 logstash 형식의 JSON을 stdout으로 내고, 컨테이너는 `--log-driver awslogs`로 떠서 그 줄을 CloudWatch로 바로 보낸다. 자격 증명은 EC2에 붙은 IAM 역할 `ec2-project`를 도커 데몬이 쓰므로 서버에 키를 두지 않는다. 도커는 이중 로깅이 기본이라 서버에도 사본을 남겨 `docker logs`가 계속 되고, `BACKEND_LOG_MAX_SIZE`(기본 10m)와 `BACKEND_LOG_MAX_FILE`(기본 3)은 그 로컬 사본(`cache-max-size`, `cache-max-file`)의 상한이지 CloudWatch 보존 기간과는 무관하다. 스트림 이름 `backend`를 고정한 것은 서버마다 앱 컨테이너가 하나뿐이고 dev와 prod는 그룹이 다르기 때문이다.

**nginx와 MySQL 로그는 에이전트가 파일을 읽는다.** nginx는 호스트 systemd로 돌아 `/var/log/nginx/`에 파일로 남기고, MySQL은 컨테이너 안에서 `/var/lib/mysql/slow.log`와 `error.log`로 남기는데 호스트에 깔린 에이전트가 컨테이너 안을 볼 수 없어 데이터 볼륨의 호스트 경로 `/var/lib/docker/volumes/yeogidam-mysql-data/_data/`로 읽어 간다. 느린 쿼리는 문장이 여러 줄이라 `# Time:`으로 시작하는 줄을 한 건의 시작으로 본다(`multi_line_start_pattern`).

**지표는 서버당 두 개만 보낸다.** 커스텀 지표는 개당 월 0.3달러라 메모리 사용률과 루트 디스크 사용률만 60초 간격으로 보낸다. `omit_hostname`이 true라 호스트 이름 차원은 빠지고, `mem_used_percent`에는 `InstanceId` 하나가 붙는다. `disk_used_percent`는 `drop_device`가 장치 이름 차원만 빼므로 `InstanceId`에 `path`와 `fstype`이 더 붙는데, `resources`가 `/` 하나라 지표 수는 서버당 1개로 같고 비용 계산도 그대로다. 앱의 actuator `metrics`(커넥션 풀, 힙, 톰캣 스레드)는 서버 안에서 부하 시험할 때 보는 용도이고 CloudWatch로 보내지 않는다.

### requestId로 access 로그와 앱 로그를 잇는다

nginx가 요청마다 만드는 `$request_id`(32자 16진수)를 두 곳에 남긴다. access 로그의 마지막 필드로 찍고, `proxy_set_header X-Request-Id $request_id`로 앱에 넘긴다. 앱의 `RequestLoggingFilter`는 그 헤더를 MDC `requestId`로 넣어 요청 안에서 찍히는 모든 로그 줄의 최상위 키로 실리고, 요청이 끝나면 `httpMethod`, `path`, `status`, `durationMs`를 붙인 한 줄을 남기며 응답 헤더 `X-Request-Id`로도 돌려준다. 그래서 클라이언트가 문의할 때 그 값을 받으면 nginx가 본 요청과 앱이 남긴 로그를 같은 값으로 찾을 수 있다. 클라이언트가 보낸 `X-Request-Id`는 nginx에서 덮이므로 값은 언제나 nginx가 정한다.

찾을 때는 Logs Insights에서 `/yeogidam/<env>/nginx`와 `/yeogidam/<env>/backend` 두 그룹을 함께 고르고 아래 쿼리를 돌린다. access 로그는 평문이고 앱 로그는 JSON이지만 둘 다 본문에 같은 문자열이 있어 `@message` 검색 하나로 두 쪽이 다 나온다.

```
fields @timestamp, @log, @message
| filter @message like "<requestId>"
| sort @timestamp asc
```

앱 로그만 볼 때는 JSON 키를 바로 쓴다.

```
fields @timestamp, level, message, httpMethod, path, status, durationMs
| filter requestId = "<requestId>"
| sort @timestamp asc
```

## 전제

- **IAM 역할.** 세 EC2(`yeogidam-dev`, `yeogidam-dev-db`, `yeogidam-prod`) 모두 CloudWatch 쓰기 권한이 든 역할 `ec2-project`가 붙어 있다. 도커 `awslogs` 드라이버와 에이전트가 이 역할로 붙는다.
- **태그 세 개.** 우테코 공용 계정은 태그 `Service=techcourse`, `Role=techcourse-etc`, `ProjectTeam=yeogidam`가 없는 리소스를 관리자가 지운다. 콘솔에서 만드는 모든 것에 이 세 태그를 단다.
- **로그 그룹은 콘솔에서 먼저 만든다.** 도커 `awslogs` 드라이버는 `awslogs-create-group`을 켜면, 에이전트는 없는 그룹을 만나면 그룹을 스스로 만드는데 둘 다 태그 없이 만든다. 그러면 관리자가 지우고 로그가 끊긴다. 그래서 `deploy.sh`에 `awslogs-create-group`을 넣지 않았고(그룹이 없으면 `docker run`이 실패해 롤백 경로를 탄다), 에이전트 템플릿의 그룹 이름은 콘솔에 만든 이름과 한 글자도 달라서는 안 된다. 같은 이유로 템플릿에 `retention_in_days`를 넣지 않는다. 넣으면 에이전트가 콘솔에서 정한 보존 기간을 덮어쓴다.
- **삭제 권한이 없으므로 이름을 먼저 정한다.** 잘못 만든 리소스를 우리가 지울 수 없어 이름을 바꾸려면 관리자에게 부탁해야 한다. 아래 이름으로 만든다.

| 종류 | 이름 | 비고 |
| --- | --- | --- |
| 로그 그룹 | `/yeogidam/dev/backend`, `/yeogidam/dev/nginx`, `/yeogidam/dev/mysql`, `/yeogidam/prod/backend`, `/yeogidam/prod/nginx` | 2026-10-01 콘솔에서 만듦, 보존 1개월 |
| 로그 그룹 | `/aws/rds/instance/yeogidam-prod-db/error`, `/aws/rds/instance/yeogidam-prod-db/slowquery` | 2026-10-02 RDS를 만들기 전에 콘솔에서 태그와 함께 만듦, 보존 1개월. RDS가 스스로 만들면 태그가 없다 |
| RDS 파라미터 그룹 | `yeogidam-prod-mysql84` | mysql8.4 패밀리. `slow_query_log=1`, `long_query_time=0.5`. 2026-10-02 |
| 지표 네임스페이스 | `Yeogidam/dev`, `Yeogidam/prod` | 에이전트와 지표 필터가 쓴다. 네임스페이스는 리소스가 아니라 따로 만들지 않는다 |
| 지표 필터가 만드는 지표 | `Nginx5xx`, `AppError` | 환경마다 하나씩 |
| 알람 | dev: `yeogidam-dev-nginx-5xx`, `yeogidam-dev-app-error`, `yeogidam-dev-disk-app`, `yeogidam-dev-disk-db`. prod: `yeogidam-prod-nginx-5xx`, `yeogidam-prod-app-error`, `yeogidam-prod-disk`, `yeogidam-prod-rds-storage` | 8개. 일곱 개는 2026-10-01, RDS 저장 공간은 2026-10-02 만듦. 디스크는 서버마다 하나씩이라 dev가 둘이다 |
| SNS 토픽 | `yeogidam-alerts` | 표준 토픽 하나를 두 환경이 같이 쓴다. 2026-10-01 만들고 팀 메일 1건 구독 |
| Lambda | `yeogidam-alerts-to-discord` | Python 3.13, 실행 역할 `techcourse-lambda-execution-role`. 2026-10-01 등록, Discord 도착 확인 |
| 대시보드 | `yeogidam-observability` | 하나에 두 환경을 담는다. 2026-10-01 dev 위젯 6개로 만들고 같은 날 prod 줄을 더함. 2026-10-02 RDS 위젯 3개를 더해 9개 |

## 서버 절차

로컬에는 nginx도 에이전트도 없으므로 서버에서 돌린다. 스크립트는 두 번 돌려도 안전하다. 렌더한 에이전트 설정이 지금 것과 같고 에이전트가 돌고 있으면 건너뛰고, MySQL 설정도 같으면 컨테이너를 건드리지 않는다.

### 앱 서버 (`yeogidam-dev`, `yeogidam-prod`)

저장소의 `Infra` 폴더를 서버로 올리고 `bootstrap-host.sh`를 돌린다. 이 스크립트는 nginx와 certbot 설치까지 맡는 것이라 처음 돌리는 서버(운영)는 인증서 발급도 같이 되고, 이미 돌린 서버(개발)는 certbot 설치와 인증서 발급을 건너뛰되 nginx 설정은 다시 렌더해 reload한 뒤 에이전트를 새로 깐다.

```bash
scp -r Infra ec2-user@<서버>:~/
ssh ec2-user@<서버>
sudo SERVER_NAME=<도메인> CERT_EMAIL=<메일> ENV_NAME=dev bash Infra/scripts/bootstrap-host.sh
```

`ENV_NAME`은 `dev`와 `prod`만 받고 다른 값이면 멈춘다. 콘솔에 만든 그룹 이름과 맞아야 하기 때문이다. 스크립트가 하는 일은 `dnf`로 `amazon-cloudwatch-agent`를 깔고, 템플릿의 `${ENV_NAME}`만 `envsubst '${ENV_NAME}'`로 채워 `/opt/aws/amazon-cloudwatch-agent/etc/config.json`에 놓고, `amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -s`로 적용해 에이전트를 (재)시작하고, `systemctl enable`로 부팅 때 뜨게 하는 것이다. `envsubst`는 셸 변수 이름 꼴(`${ENV_NAME}`)만 치환하므로 에이전트 자체 문법인 `${aws:InstanceId}`는 목록이 없어도 건드리지 않지만, 앞으로 템플릿에 다른 `$이름`이 들어가도 `ENV_NAME`만 바뀌도록 목록을 준다.

이 PR을 머지하면 nginx 설정도 바뀐다(`log_format`에 `$request_id`가 붙고 `X-Request-Id` 헤더를 넘긴다). `bootstrap-host.sh`가 템플릿을 다시 렌더해 `nginx -t` 뒤 reload하므로 따로 할 일은 없다.

**앱 컨테이너의 로그 드라이버는 다음 배포 때 바뀐다.** `deploy.sh`는 `docker run` 옵션으로 드라이버를 정하므로 이미 떠 있는 컨테이너는 그대로이고, 다음 배포가 컨테이너를 만들 때 `awslogs`가 된다. 드라이버 변경은 `deploy.sh`를 고치는 푸시와 함께 오므로 새 이미지가 빌드되어 어차피 교체된다. env 파일만 바뀐 경우는 배포로 반영되지 않으므로 `Infra/scripts/restart-backend.sh`로 손배포한다(#267).

### 개발 DB 서버 (`yeogidam-dev-db`)

```bash
scp -r Infra ec2-user@<서버>:~/
ssh ec2-user@<서버>
sudo ENV_NAME=dev bash Infra/scripts/bootstrap-db-host.sh
```

`ENV_NAME`은 `dev`만 받는다. 운영 DB는 RDS로 가고 `/yeogidam/prod/mysql` 그룹을 만들지 않았으므로, `prod`를 받게 두면 실수로 돌렸을 때 에이전트가 태그 없는 그룹을 만들어 버리기 때문이다. 스크립트는 `Infra/mysql/observability.cnf`를 호스트의 `/opt/yeogidam/mysql-conf/`에 복사한다. 그 폴더가 컨테이너의 `/etc/mysql/conf.d`로 바인드되어 있어 mysqld가 시작할 때 읽는다. 파일이 이미 같으면 아무것도 하지 않고, 다르면 복사한 뒤 `docker restart -t 60`으로 컨테이너를 다시 띄운다. 종료 대기를 60초로 준 이유는 기본값 10초 뒤에는 SIGKILL이 가서 InnoDB가 더티 페이지를 다 쓰기 전에 죽을 수 있기 때문이고, 보통은 몇 초 만에 끝난다. 이때 개발 DB가 mysqld 종료와 기동을 합쳐 보통 10초 안팎 멈추므로 팀이 쓰는 시간은 피한다. `docker restart`는 컨테이너 프로세스가 뜨자마자 돌아오고 mysql 이미지는 그 뒤에야 설정을 검사하므로, 스크립트는 최대 60초 동안 2초마다 `mysqladmin ping`으로 mysqld가 접속을 받는지 기다리고, 그 안에 안 되거나 컨테이너가 재시작을 반복하면(`RestartCount` 증가) 멈추고 `error.log` 경로를 알려 준다. 이어서 `gettext`(envsubst용, DB 서버는 `bootstrap-host.sh`를 돌린 적이 없어 없다)와 에이전트를 깔고 `agent-db.json.template`를 앱 서버와 같은 방식으로 적용한다.

컨테이너 이름이나 설정 폴더가 기본값과 다르면 `MYSQL_CONTAINER_NAME`, `MYSQL_CONF_DIR`로 바꿀 수 있다. 다만 에이전트가 읽는 로그 경로는 템플릿에 볼륨 이름 `yeogidam-mysql-data`로 박혀 있으니 볼륨 이름이 다르면 템플릿도 고친다.

### 확인

서버에서 본다.

```bash
# 에이전트가 running인지
sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a status
# 권한이나 그룹 이름 문제는 여기에 남는다
sudo tail -n 50 /opt/aws/amazon-cloudwatch-agent/logs/amazon-cloudwatch-agent.log
# 앱 서버: 컨테이너가 awslogs로 떠 있는지 (배포 뒤)
docker inspect --format '{{.HostConfig.LogConfig.Type}} {{json .HostConfig.LogConfig.Config}}' yeogidam-backend
# DB 서버: 로그 파일이 생겼는지
sudo ls -l /var/lib/docker/volumes/yeogidam-mysql-data/_data/slow.log /var/lib/docker/volumes/yeogidam-mysql-data/_data/error.log
```

콘솔에서 본다. CloudWatch > 로그 그룹에서 각 그룹에 스트림(`backend`, `access`, `error`, `slow`)이 생기고 새 줄이 들어오면 된 것이다. 지표는 CloudWatch > 지표 > `Yeogidam/dev`, `Yeogidam/prod`에서 「InstanceId」 묶음에 `mem_used_percent`가, 「InstanceId, fstype, path」 묶음에 `disk_used_percent`가 보이면 되고, 60초 간격이라 첫 값까지 1~2분 걸린다. 디스크 지표를 「InstanceId」 묶음에서 찾으면 안 보인다. 배포 잡의 `GITHUB_STEP_SUMMARY`에도 「로그: CloudWatch `/yeogidam/<env>/backend` 스트림 `backend`」 줄이 찍힌다.

## 콘솔 절차

리전은 `ap-northeast-2`다. 아래 순서대로 만들고 마지막에 태그를 한 번에 단다.

### 1. 지표 필터

로그 그룹 > 지표 필터 탭 > 지표 필터 생성. 환경마다 두 개, 모두 네 개다. dev 두 개는 2026-10-01에 만들었다(필터 이름 `nginx-5xx`, `app-error`).

| 로그 그룹 | 필터 패턴 | 네임스페이스 | 지표 이름 | 지표 값 | 기본값 |
| --- | --- | --- | --- | --- | --- |
| `/yeogidam/dev/nginx` | `[ip, timestamp, request, status_code = 5*, bytes, request_time, user_agent, request_id]` | `Yeogidam/dev` | `Nginx5xx` | 1 | 0 |
| `/yeogidam/dev/backend` | `{ $.level = "ERROR" }` | `Yeogidam/dev` | `AppError` | 1 | 0 |
| `/yeogidam/prod/nginx` | 위와 같음 | `Yeogidam/prod` | `Nginx5xx` | 1 | 0 |
| `/yeogidam/prod/backend` | 위와 같음 | `Yeogidam/prod` | `AppError` | 1 | 0 |

nginx 패턴은 `nginx.conf.template`의 `log_format main`을 공백으로 나눈 것이다. `[$time_local]`과 `"$request"`, `"$http_user_agent"`는 대괄호와 따옴표 안이 통째로 한 필드로 잡혀 정확히 여덟 필드가 된다. 필드 수가 맞아야 매칭되므로 `log_format`을 고치면 이 패턴도 같이 고친다. 같은 그룹의 `error` 스트림 줄은 모양이 달라 여덟 필드에 안 맞으니 5xx로 세지지 않는다. 기본값 0을 두는 이유는 로그가 들어왔는데 매칭이 없을 때도 0을 찍어 그래프가 끊기지 않게 하려는 것이다. nginx 요청 제한(IP당 초당 10회, 로그인 경로 분당 10회)에 걸린 429는 access 로그에 아예 남기지 않으므로 이 필터에도 대시보드에도 보이지 않는다. 남기면 거절된 요청 한 줄이 그대로 수집 요금이 되기 때문이고, 폭주가 있었는지는 EC2 기본 지표 `NetworkIn`과 `CPUUtilization`이 치솟는 것으로 본다.

앱 패턴은 logstash JSON의 최상위 키 `level`을 본다. 필터 생성 화면의 「패턴 테스트」에 실제 로그 줄을 넣어 매칭 여부를 보고 저장한다.

### 2. 알람

CloudWatch > 알람 > 알람 생성. 로그 지표 둘은 환경마다 하나씩이고, 디스크는 서버마다 하나씩이라 dev 4개, prod 3개이며, 여기에 RDS 저장 공간 하나를 더해 모두 여덟 개다. 일곱 개는 2026-10-01에, RDS 것은 2026-10-02에 만들었다.

| 알람 | 지표 | 통계 | 기간 | 조건 |
| --- | --- | --- | --- | --- |
| `yeogidam-<env>-nginx-5xx` | `Yeogidam/<env>` `Nginx5xx` | Sum | 5분 | 5 이상 |
| `yeogidam-<env>-app-error` | `Yeogidam/<env>` `AppError` | Sum | 5분 | 5 이상 |
| `yeogidam-dev-disk-app` | `Yeogidam/dev` `disk_used_percent`, InstanceId = 앱 서버 | Maximum | 5분 | 85 이상 |
| `yeogidam-dev-disk-db` | `Yeogidam/dev` `disk_used_percent`, InstanceId = DB 서버 | Maximum | 5분 | 85 이상 |
| `yeogidam-prod-disk` | `Yeogidam/prod` `disk_used_percent`, InstanceId = 운영 앱 서버 | Maximum | 5분 | 85 이상 |
| `yeogidam-prod-rds-storage` | `AWS/RDS` `FreeStorageSpace`, DBInstanceIdentifier = `yeogidam-prod-db` | Minimum | 5분 | 2GiB(2147483648 바이트) 미만 |

통계를 가르는 기준은 지표의 성질이다. `Nginx5xx`와 `AppError`는 줄마다 1을 찍는 건수 지표라 Sum이어야 5분 안의 건수가 되고(Average면 언제나 1이라 알람에 안 걸린다), `disk_used_percent`는 비율이라 Maximum으로 5분 안의 최고치를 본다. `FreeStorageSpace`는 남은 양이라 Minimum으로 5분 안의 최저치를 보고, 단위가 바이트라 임계값도 바이트로 적는다. RDS는 저장 공간 자동 확장을 꺼 두어 차면 쓰기가 멈추므로 이 알람이 유일한 안전망이다.

공통으로 다음과 같이 둔다.

- 평가할 데이터 포인트는 1 중 1이다. 5분 안에 한 번 넘으면 바로 울린다.
- 누락된 데이터는 「양호」로 처리한다. 개발 서버는 요청이 없는 시간이 길어 로그 지표가 비는데, 이때 불충분 데이터로 넘어가면 Discord에 상태 변화 알림이 쓸데없이 온다.
- 알림은 ALARM과 OK 두 상태 모두 SNS 토픽 `yeogidam-alerts`로 보낸다. OK도 보내야 Discord에서 초록색으로 회복을 볼 수 있다.
- 알람 설명에 대응 방법 한 줄을 적는다. Lambda가 `AlarmDescription`을 Discord 메시지의 「설명」 필드로 같이 보여 주므로, 예를 들어 `yeogidam-prod-disk`에는 「`docker system df`와 `journalctl --disk-usage`로 큰 것을 찾는다」처럼 적으면 알림을 받은 사람이 바로 시작할 수 있다.

디스크 알람을 서버마다 따로 둔 이유는 `dev` 네임스페이스에 앱 서버와 DB 서버 두 `InstanceId`가 있어 지표 하나를 고르면 한 대만 보기 때문이다. 알람 이름에 서버가 들어가므로 울렸을 때 어디인지 바로 안다. 서버가 더 늘면 알람을 하나씩 더하는 대신 「Metrics Insights 쿼리」로 `SELECT MAX(disk_used_percent) FROM "Yeogidam/dev"`를 지표로 삼아 알람 하나로 덮는 방법도 있는데, 그때는 어느 서버인지를 대시보드 디스크 위젯에서 봐야 한다.

### 3. 대시보드

CloudWatch > 대시보드 > `yeogidam-observability` 하나를 만들고 아래 위젯을 둔다. 대시보드는 개당 월 3달러라 환경별로 나누지 않는다. 2026-10-01에 dev 기준으로 여섯 개를 만들고 같은 날 운영이 올라와 같은 위젯에 `Yeogidam/prod` 지표와 prod 알람과 prod 로그 그룹을 더했다. 2026-10-02에 RDS 위젯 세 개를 더해 아홉 개다.

| 위젯 | 종류 | 내용 |
| --- | --- | --- |
| 메모리 사용률 | 선 그래프 | `Yeogidam/dev`와 `Yeogidam/prod`의 `mem_used_percent`, `InstanceId`별로 세 줄(개발 앱, 개발 DB, 운영 앱) |
| 디스크 사용률 | 선 그래프 | 같은 방식으로 `disk_used_percent`. 85에 수평 주석선을 두면 알람선이 보인다 |
| nginx 5xx 건수 | 선 그래프 | 두 환경의 `Nginx5xx` Sum, 기간 5분 |
| 앱 ERROR 건수 | 선 그래프 | 두 환경의 `AppError` Sum, 기간 5분 |
| 알람 상태 | 알람 상태 위젯 | 알람 여덟 개 전부 |
| 최근 앱 ERROR | 로그 테이블 | `/yeogidam/dev/backend`와 `/yeogidam/prod/backend`, `fields @timestamp, @log, message, path, status, requestId \| filter level = "ERROR" \| sort @timestamp desc \| limit 20`. ERROR가 없으면 「No data found」가 정상이다 |
| RDS CPU와 연결 수 | 선 그래프 | `AWS/RDS` `CPUUtilization`(Average, 1분)과 `DatabaseConnections`(Maximum, 1분, 오른쪽 축). 단위가 달라 축을 나눈다 |
| RDS 남은 저장 공간과 메모리 | 선 그래프 | `FreeStorageSpace`와 `FreeableMemory`(Minimum, 5분). 둘 다 바이트라 한 축 |
| RDS 느린 쿼리 | 로그 테이블 | `/aws/rds/instance/yeogidam-prod-db/slowquery`, `fields @timestamp, @message \| sort @timestamp desc \| limit 20`. 0.5초를 넘긴 쿼리가 SQL 원문째 보인다. 부하 시험 때 병목 쿼리를 여기서 찾는다 |

저장은 오른쪽 위 「Save dashboard」를 눌러야 되고, 부하 시험 때는 시간 범위 1h에 자동 새로고침 1분으로 두고 본다.

### 4. SNS와 Lambda

1. SNS > 주제 > 주제 생성. 유형은 표준, 이름은 `yeogidam-alerts`.
2. Lambda 함수 등록은 `Infra/lambda/alerts_to_discord.py` 머리 docstring의 여섯 단계를 따른다. 함수 이름 `yeogidam-alerts-to-discord`, 런타임 Python 3.13, 실행 역할 `techcourse-lambda-execution-role`, 코드는 파일 내용을 콘솔 편집기에 붙여 넣고, 환경 변수 `DISCORD_WEBHOOK_URL`에 Discord 채널의 웹훅 URL을 넣고, 트리거로 SNS `yeogidam-alerts`를 건다. 핸들러 이름은 콘솔 기본값 `lambda_function.lambda_handler` 그대로 두면 되고 표준 라이브러리만 쓰므로 배포 패키지가 필요 없다.
3. 연결 확인은 SNS 콘솔에서 `yeogidam-alerts`에 아무 문장이나 게시한다. 본문이 그대로 Discord에 오면 된 것이고, 실제 알람은 색 있는 embed(ALARM 빨강, OK 초록)로 오며 시각은 KST로 바꿔 보여 준다.
4. 알람을 만들 때 알림 대상으로 이 토픽을 고른다. 알람보다 토픽을 먼저 만드는 이유는 알람 생성 화면이 기존 토픽만 고를 수 있기 때문이다.
5. 2026-10-01에 토픽과 메일 구독(팀 공용 주소 1건, 확인 완료)과 Lambda를 만들었고, 토픽에 시험 메시지를 게시해 메일과 Discord 양쪽에 도착하는 것을 확인했다. Discord 채널은 지금 하나를 두 환경이 같이 쓰고, 출시 뒤 개발 알람이 운영 알람을 묻으면 토픽 `yeogidam-alerts-prod`와 Lambda 하나를 더 만들어 다른 웹훅을 넣는다.

### 5. 태그를 한 번에 단다

Resource Groups & Tag Editor > Tag Editor에서 리전 `ap-northeast-2`, 리소스 유형에 `CloudWatch::Alarm`, `SNS::Topic`, `Lambda::Function`, `Logs::LogGroup`을 고르고 검색한 뒤, 이름이 `yeogidam`으로 시작하는 것을 모두 선택해 「선택한 리소스의 태그 관리」에서 세 태그를 한 번에 단다. 만들 때 하나씩 달아도 되지만 빠뜨린 것이 없는지 마지막에 여기서 한 번 훑는 편이 안전하다. 대시보드와 지표 필터는 태그 항목이 없다. 2026-10-01에 dev 리소스 11개(알람 4, 토픽 1, Lambda 1, 로그 그룹 5)에 달았고, `ProjectTeam = yeogidam`으로 다시 검색해 11개가 나오는 것을 확인했다. 같은 날 저녁 prod 알람 3개까지 14개가 됐다. 2026-10-02 RDS 쪽은 인스턴스와 파라미터 그룹과 로그 그룹 2개는 만들 때 달았고 알람 `yeogidam-prod-rds-storage`만 Tag Editor로 달았다. Lambda가 첫 실행 때 스스로 만드는 `/aws/lambda/yeogidam-alerts-to-discord` 로그 그룹은 태그 없이 생기므로 2026-10-02에 따로 달았다. 팀이 만든 리소스 전체 목록은 [current-state.md](current-state.md) 「AWS 리소스 목록」에 있다.

## 알아 둘 제약

- **`status`와 `durationMs`는 문자열이다.** MDC 값이 문자열이라 JSON에도 `"status":"500"`, `"durationMs":"14"`처럼 실린다. 지표 필터에서 이 두 키를 걸 때는 `{ $.status = "500" }`처럼 따옴표로 비교해야 맞고, 숫자 비교(`{ $.durationMs > 1000 }`)는 매칭되지 않는다. 소요 시간을 기준으로 지표를 세고 싶어지면 문자열 패턴으로 억지로 맞추기보다 MDC 대신 숫자 필드로 남기게 앱을 고친다.
- **에이전트가 보내는 로그의 이벤트 시각은 줄을 읽은 시각이다.** 템플릿의 `collect_list`에 `timestamp_format`을 주지 않았으므로 nginx와 MySQL 로그의 `@timestamp`는 로그 줄에 적힌 시각이 아니라 에이전트가 읽은 시각이다(`timezone` 키는 `timestamp_format`이 있을 때만 뜻이 있어 넣지 않았다). 실시간으로는 몇 초 차이라 상관없지만, 에이전트가 멈췄다가 밀린 줄을 한꺼번에 올리면 그 줄들이 전부 올린 시각으로 찍히므로 requestId로 시간순 대조할 때는 줄 안의 시각을 같이 본다. 앱 로그도 도커가 줄을 받은 시각이 실리므로 두 쪽 기준이 같다.
- **개발 DB의 `docker logs`에 MySQL 에러가 더 이상 안 나온다.** `observability.cnf`가 `log_error`를 파일로 돌렸기 때문이다. 서버에서 볼 때는 `/var/lib/docker/volumes/yeogidam-mysql-data/_data/error.log`를, 콘솔에서는 `/yeogidam/dev/mysql`의 `error` 스트림을 본다. 설정이 틀려 mysqld가 못 뜰 때도 이유는 이 파일에 남는다.
- **보존 기간은 콘솔에서 바꾼다.** 지금은 다섯 그룹 모두 1개월이다. 출시 뒤 `prod` 두 그룹은 3개월로 늘린다. 템플릿에 `retention_in_days`가 없으므로 콘솔 값이 그대로 남는다.
- **운영 DB 로그는 RDS 로그 내보내기가 보낸다(2026-10-02).** `/yeogidam/prod/mysql` 그룹은 없고 `bootstrap-db-host.sh`는 개발 서버 전용이다. RDS `yeogidam-prod-db`는 파라미터 그룹 `yeogidam-prod-mysql84`(`slow_query_log=1`, `long_query_time=0.5`)로 개발 DB와 같은 기준이고, 로그 내보내기는 error와 slowquery만 켰다. general은 들어온 쿼리를 전부 남겨 부하 시험 때 요금이 바로 늘고, audit는 옵션 그룹에 플러그인을 더 넣어야 하는데 감사 요건이 없다. 그룹은 `/aws/rds/instance/yeogidam-prod-db/error`와 `/slowquery`이고 RDS가 스스로 만들면 태그가 없어 지워지므로 인스턴스보다 먼저 콘솔에서 태그와 함께 만들었다. 스트림 이름은 `yeogidam-prod-db`다. 느린 쿼리 경로는 앱 서버에서 `SELECT SLEEP(1)`을 보내 slowquery 그룹에 그 문장이 오는 것으로 확인했다. Performance Insights는 micro 클래스에서 지원되지 않고 Enhanced Monitoring은 IAM 역할(`rds-monitoring-role`)을 만들 수 없어 켤 수 없다. RDS 기본 지표(`AWS/RDS`)는 1분 간격으로 무료라 대시보드와 알람에 그대로 쓴다.
- **`awslogs` 드라이버는 기본 blocking 모드다.** CloudWatch API가 오래 멈추면 앱의 stdout 쓰기가 막힐 수 있다. 같은 리전이고 IAM 역할로 붙으므로 우선 그대로 두고, 응답이 이유 없이 느려지는 일이 보이면 `--log-opt mode=non-blocking`을 검토한다.
- **`awslogs` 드라이버가 실패하면 배포가 롤백된다.** 그룹이 없거나 역할에 권한이 없으면 `docker run`이 컨테이너를 만들지 못하고, 그때는 이미 기존 컨테이너를 rename한 뒤라 `deploy.sh`의 롤백 경로를 타서 배포 실패로 기록된다. 그룹 이름을 바꿀 때는 콘솔에 새 그룹을 먼저 만든다.

## 비용

| 항목 | 단가 | 이 구성 |
| --- | --- | --- |
| 대시보드 | 개당 월 3달러 | 1개, 3달러 |
| 커스텀 지표 | 개당 월 0.3달러 | 에이전트 서버 3대 × 2개와 지표 필터 4개로 10개, 3달러. RDS 기본 지표(`AWS/RDS`)는 무료라 세지 않는다 |
| 알람 | 개당 월 0.1달러 | 8개, 0.8달러 |
| 로그 수집 | GB당 0.76달러 | 월 1GB 안팎, 0.76달러. RDS error와 slowquery는 양이 적다 |

합쳐서 월 7달러 안팎이다. 지표와 알람을 하나 더할 때마다 각각 0.3달러와 0.1달러가 붙으므로, 보고 싶은 것이 생기면 지표를 새로 보내기보다 있는 로그를 Logs Insights로 조회하는 쪽을 먼저 본다. 조회는 스캔한 데이터 GB당 과금이라 이 로그 양에서는 무시할 만하다.

## 사고 기록

알람이 울려 대응한 일은 `Backend/docs/infra/incidents/<날짜>-<제목>.md`에 남긴다. 파일 이름은 `2026-10-15-prod-disk-full.md`처럼 날짜를 앞에 두어 정렬되게 한다. 항목은 다섯 개이고, 항목마다 한 문단이면 된다.

1. **감지 시각.** 알람이 ALARM으로 바뀐 시각(Discord 메시지의 KST 시각)과 사람이 처음 본 시각.
2. **알림 경로.** 어느 알람이 울렸고 Discord로 왔는지, 아니면 사용자 문의나 다른 경로로 알았는지. 알람이 못 잡은 사고면 어느 조건을 더해야 잡을 수 있었는지 같이 적는다.
3. **원인.** 무엇이 왜 그렇게 됐는지. requestId, 로그 줄, 지표 그래프처럼 근거가 된 것을 붙인다.
4. **조치.** 무엇을 해서 복구했는지와 OK로 돌아온 시각.
5. **재발 방지.** 코드나 설정이나 알람 조건을 무엇으로 바꿨는지, 또는 바꾸지 않기로 했으면 그 이유. 바꾼 것이 PR이면 번호를 적는다.

사고가 없어도 알람 조건을 바꿨을 때는 이 문서의 알람 표를 고친다.

기록 목록.

- [2026-10-01 개발 환경 카카오 로그인 503](incidents/2026-10-01-dev-kakao-login-503.md). 알람 기준 미만이라 울리지 않았고 대시보드 로그 테이블에서 KOE303(redirect_uri 불일치)으로 원인을 읽은 첫 사례. 같은 날 두 환경에서 일부러 울린 드릴 결과도 끝에 있다.
