# 앱 관찰 데이터 수집

앱 서버에서 OpenTelemetry Java Agent가 로그, 메트릭, 트레이스를 만들고 Alloy가 모니터링 서버로 보낸다.
로그는 Loki, 메트릭은 Prometheus, 트레이스는 Tempo에 저장한다. 이 문서는 서버 준비 절차이며,
서버에 적용하거나 수집을 확인했다는 기록은 아니다.

앱과 Alloy는 Docker 네트워크 `yeogidam-observability`에서 `http://alloy:4318`로 통신한다.
4318 포트는 호스트에 공개하지 않는다. Alloy 컨테이너 이름은 `yeogidam-alloy`, 메모리 상한은 256MiB다.
앱 이미지의 기본값은 `OTEL_JAVAAGENT_ENABLED=false`이므로 Alloy를 시작해도 앱 수집은 켜지지 않는다.

## 1. Docker Compose 준비

앱 서버는 Amazon Linux 2023 ARM64 기준이다. Docker Engine과 CLI가 설치되어 실행 중이어야 한다.
아래 명령과 이후 서버 명령은 앱 서버에서 실행한다.

```bash
sudo docker version
sudo docker compose version
uname -m
```

Compose 플러그인이 없고 아키텍처가 `aarch64`이면 아래처럼 설치한다. 예시 버전은 `v5.6.0`이다.
이미 설치되어 있으면 건너뛴다. 수동 설치한 플러그인은 자동으로 갱신되지 않는다.

```bash
(
  set -e
  compose_download_dir="$(mktemp -d)"
  cd "$compose_download_dir"
  curl --fail --location --remote-name \
    https://github.com/docker/compose/releases/download/v5.6.0/docker-compose-linux-aarch64
  curl --fail --location --remote-name \
    https://github.com/docker/compose/releases/download/v5.6.0/docker-compose-linux-aarch64.sha256
  sha256sum --check docker-compose-linux-aarch64.sha256
  sudo install -D -m 0755 docker-compose-linux-aarch64 /usr/local/lib/docker/cli-plugins/docker-compose
)
sudo docker compose version
```

## 2. 파일과 환경변수 준비

이 PR이 반영된 저장소의 `Infra` 폴더를 서버에 복사한 뒤, `Infra` 폴더가 있는 디렉터리에서 실행한다.
개발 서버와 운영 서버 모두 재시작 스크립트를 갱신한다. 이미 복사한 사본은 CD가 자동으로 갱신하지 않는다.
예전 사본으로 앱을 재생성하면 Alloy 네트워크에 연결되지 않는다.

```bash
sudo install -d -m 0755 /opt/yeogidam/alloy
sudo install -m 0644 Infra/alloy/compose.yml /opt/yeogidam/alloy/compose.yml
sudo install -m 0644 Infra/alloy/config.alloy /opt/yeogidam/alloy/config.alloy
sudo install -m 0700 Infra/scripts/restart-backend.sh /opt/yeogidam/restart-backend.sh
```

`sudo vi /opt/yeogidam/alloy.env`로 아래 네 키를 넣는다. 자리표는 서버에서만 실제 값으로 바꾼다.
기존 파일이 있으면 값을 유지하며 필요한 키만 수정한다.

```dotenv
LOKI_OTLP_ENDPOINT=http://<모니터링_서버_사설_IP>/otlp
PROMETHEUS_REMOTE_WRITE_URL=http://<모니터링_서버_사설_IP>/api/v1/write
TEMPO_OTLP_ENDPOINT=<모니터링_서버_사설_IP>:4317
MONITOR_AUTHORIZATION=<인증_방식과_인증값>
```

| 키 | 형식 |
| --- | --- |
| `LOKI_OTLP_ENDPOINT` | HTTP 기본 주소. `/otlp`까지만 지정한다. exporter가 `/v1/logs`를 붙이므로 `/otlp/v1/logs`를 넣지 않는다 |
| `PROMETHEUS_REMOTE_WRITE_URL` | remote write 전체 URL. 경로는 `/api/v1/write`이며 모니터링 서버에서 수신을 허용해야 한다 |
| `TEMPO_OTLP_ENDPOINT` | 사설망 Nginx의 평문 gRPC 주소 `IP:4317`. `http://`와 경로를 붙이지 않는다 |
| `MONITOR_AUTHORIZATION` | 세 전송 경로가 공통으로 쓰는 `Authorization` 헤더 전체 값. Basic 인증이면 `Basic <user:password의 Base64 값>` 형태다 |

HTTP 포트가 80이 아니면 호스트 뒤에 포트도 넣는다. 사설망 Nginx의 수신 경로와 인증 설정이
이 값들과 맞아야 한다. 인증값은 저장소, PR, 터미널 출력에 남기지 않는다.

```bash
sudo chown root:root /opt/yeogidam/alloy.env
sudo chmod 600 /opt/yeogidam/alloy.env
```

앱 설정은 기존 `/opt/yeogidam/backend.env`에 넣는다. `sudo -u github-runner vi`로 편집하고
소유자 `github-runner`와 권한 600을 유지한다. 이미지에는 서비스 이름 `yeogidam-backend`, 전송 주소
`http://alloy:4318`, 프로토콜 `http/protobuf`가 기본값으로 들어 있다. 기존 서버가 다른 서비스 이름을
사용 중이면 `OTEL_SERVICE_NAME`으로 그 값을 유지하고 개발과 운영에서 같은 이름을 쓴다.

```dotenv
OTEL_JAVAAGENT_ENABLED=false
```

환경 속성 `deployment.environment.name`은 두 배포 스크립트가 검증한 Spring 프로필로 주입한다.
`backend.env`에 다른 `OTEL_RESOURCE_ATTRIBUTES`가 있으면 보존하고 환경 속성만 `dev` 또는 `prod`로
교체한다. 환경 이름을 env 파일에 별도로 넣을 필요는 없다.
기존 `OTEL_SDK_DISABLED=true`는 제거하거나 `false`로 바꾼다. 그대로 두면 에이전트를 켜도 수집되지 않는다.
중복 키를 추가하지 말고 기존 줄을 수정한다.

## 3. 네트워크 생성과 Alloy 시작

Compose는 외부 네트워크를 만들지 않으므로 먼저 준비한다. `deploy.sh`와 갱신한
`restart-backend.sh`도 같은 네트워크를 만들고 앱을 연결한다.

```bash
if ! sudo docker network inspect yeogidam-observability >/dev/null 2>&1; then
  sudo docker network create yeogidam-observability
fi
sudo docker compose -f /opt/yeogidam/alloy/compose.yml config --quiet
sudo docker compose -f /opt/yeogidam/alloy/compose.yml run --rm --no-deps alloy validate /etc/alloy/config.alloy
sudo docker compose -f /opt/yeogidam/alloy/compose.yml up -d
sudo docker compose -f /opt/yeogidam/alloy/compose.yml ps
sudo docker logs --tail 100 yeogidam-alloy
```

`config --quiet`는 환경변수 값을 출력하지 않고 Compose 구성을 검사한다.
`alloy validate`는 설정을 검사하며, 모니터링 서버의 인증이나 실제 저장 성공까지 보장하지 않는다.
컨테이너가 실행 중이어도 전송 실패가 반복될 수 있으므로 로그와 저장소를 함께 확인한다.

## 4. 앱 수집 활성화와 확인

먼저 개발 서버의 `backend.env`에서 `OTEL_JAVAAGENT_ENABLED=true`로 바꾸고 아래 명령으로
앱 컨테이너를 재생성한다. `docker restart`나 같은 이미지의 CD 재실행만으로는 env 변경이 반영되지 않는다.

```bash
sudo bash /opt/yeogidam/restart-backend.sh
sudo docker network inspect yeogidam-observability --format '{{range .Containers}}{{println .Name}}{{end}}'
sudo docker stats --no-stream
free -m
```

네트워크 목록에 Alloy와 새 앱 컨테이너가 함께 있어야 한다. 앱에서 실제 요청을 보낸 뒤 다음을 확인한다.

- 새 앱 컨테이너의 `sudo docker logs --tail 100 <컨테이너_이름>`에서 `alloy` 이름 해석 실패나 전송 실패가 반복되지 않는다.
- Grafana의 Loki 데이터 소스에서 설정한 `service_name`과 환경으로 새 앱 로그를 찾는다.
- Prometheus에서 `deployment_environment_name="dev"`인 앱 메트릭이 갱신되는지 확인한다.
- Tempo에서 설정한 `service.name`과 `deployment.environment.name=dev`로 새 트레이스를 찾는다.

Java Agent는 `requestId`, `httpMethod`, `path`, `status`, `durationMs`를 MDC에서 수집한다.
각 로그가 발생한 시점에 MDC에 있는 값만 Loki로 전달한다. 새 이미지 적용 후 `requestId`가 담긴
앱 로그를 Loki에서 찾을 수 있는지 확인한다. nginx 로그 수집 경로는 기존 CloudWatch를 유지한다.

블루그린 배포 중 두 앱이 함께 도는 구간에도 `docker stats`와 `free -m`을 반복 확인한다.
전환이 끝난 뒤 한 번 잰 값만으로 판단하지 않는다. 개발 서버에서 실제 저장과 메모리를 확인한 뒤
운영 서버의 스크립트와 Alloy 준비를 확인하고 같은 순서로 수집을 켠다.

## 5. 설정 변경 반영

저장소의 `compose.yml`이나 `config.alloy`가 바뀌면 2절의 경로에 다시 복사한다.
`alloy.env`는 서버에서 수정하고 다음 명령으로 검사한 뒤 재생성한다.

```bash
sudo docker compose -f /opt/yeogidam/alloy/compose.yml config --quiet
sudo docker compose -f /opt/yeogidam/alloy/compose.yml run --rm --no-deps alloy validate /etc/alloy/config.alloy
sudo docker compose -f /opt/yeogidam/alloy/compose.yml up -d --force-recreate
sudo docker logs --tail 100 yeogidam-alloy
```

Alloy env 변경은 앱 재시작이 필요 없고, `backend.env` 변경은 4절처럼 앱을 재생성해야 한다.
설정을 바꾼 뒤에는 해당 로그, 메트릭, 트레이스가 실제 저장되는지도 다시 확인한다.

## 6. 수집 중지

먼저 `backend.env`의 `OTEL_JAVAAGENT_ENABLED=false`를 반영해 앱을 재생성한 뒤 Alloy를 내린다.
에이전트를 켠 채 Alloy부터 내리면 앱에 전송 오류가 반복될 수 있다.

```bash
sudo bash /opt/yeogidam/restart-backend.sh
sudo docker compose -f /opt/yeogidam/alloy/compose.yml down
```

`down`은 외부 네트워크와 이름 있는 `yeogidam-alloy-data` 볼륨을 삭제하지 않는다.
앱이 사용 중인 네트워크는 지우지 않는다. 다시 켤 때는 Alloy를 먼저 시작하고 4절을 따른다.
기존 CloudWatch 수집은 이 절차로 중지되지 않는다.

## 보존 기간

보존 기간은 Alloy가 아니라 각 저장소에서 관리한다. 현재 값과 서버 적용 기록은
[운영 관찰 문서](../../Backend/docs/infra/observability.md#로그와-트레이스-보존-기간)를 기준으로 확인한다.

## 참고

트레이스는 batch 뒤에서 `/actuator/`로 시작하는 `url.path`의 스팬을 제외하고,
`transform.scrub`에서 `url.query`만 삭제한 후 Tempo로 보낸다.
소셜 로그인 인가 코드와 state를 제외하기 위한 처리이며 로그와 메트릭은 변경하지 않는다.
필터는 개별 스팬에 적용되며 앱의 계측 비용을 줄이거나 자식 스팬 전체를 함께 제거하지 않는다.

- [Docker Compose 플러그인 설치](https://docs.docker.com/compose/install/linux/)
- [Loki OTLP 수신 주소](https://grafana.com/docs/loki/latest/send-data/otel/)
- [Alloy 설정 검사](https://grafana.com/docs/alloy/latest/reference/cli/validate/)
