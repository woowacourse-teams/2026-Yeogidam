# 인프라 현재 상태

지금 실제로 돌아가는 것과 ADR이 정했는데 아직 못 한 것을 적는다. **ADR은 결정 기록이라 함부로 고치지 않지만 이 문서는 바뀔 때마다 고친다.** 인프라를 건드리는 PR은 이 문서도 같이 고친다.

마지막 갱신 2026-10-02.

## 배포 경로

```
feat/#번호  ──PR──▶  be-dev  ──머지──▶  개발 서버 배포
                       │
                       └──PR──▶  be-release  ──머지──▶  운영 서버 배포
                                      │
                                      └──PR──▶  main  ──태그──▶  backend-v1.0.0
```

브랜치 전략은 [인프라 ADR-05](adr-05-branch-strategy.md)에 있다.

| | 값 |
| --- | --- |
| 워크플로 | `backend-ci.yml`, `backend-cd.yml`, `discord-pr.yml`, `require-develop-for-main.yml` |
| 이미지 저장소 | Docker Hub |
| 배포 식별자 | digest (`yeogidam/backend@sha256:...`) |
| 역할 태그 | `current`, `previous`, `candidate` |
| 헬스 판정 | `/actuator/health/liveness` polling |
| 컨테이너 이름 | `yeogidam-backend` |
| 바인드 주소 | `127.0.0.1` |
| 앞단 | 서버마다 호스트 nginx가 443에서 받아 `127.0.0.1:8080`으로 넘긴다 (2026-09-30) |
| 개발 DB | `yeogidam-dev-db`의 Docker MySQL 8.4 (2026-09-29) |
| 운영 DB | RDS MySQL 8.4 `yeogidam-prod-db` (2026-10-02) |

앱은 `127.0.0.1`에만 귀를 열고 바깥 요청은 호스트의 nginx가 443에서 받아 넘긴다. 앞단과 DB의 자세한 구성은 아래 「인프라 ADR-03」 절에 있다.

## 환경 설정

각 서버의 `/opt/yeogidam/backend.env`에 다섯 키가 있다. 소유는 `github-runner`이고 권한은 600이다.

```
SPRING_PROFILES_ACTIVE
DB_URL
DB_USERNAME
DB_PASSWORD
JWT_SECRET
```

비밀값은 각 서버에서 `openssl`로 만들어 넣었다. `DB_URL`은 시간대 파라미터(`connectionTimeZone=UTC&forceConnectionTimeZoneToSession=true&preserveInstants=true`)까지 갖춘 값이다. 개발은 `yeogidam-dev-db`의 사설 IP이고, 운영은 2026-10-02에 RDS를 만들어 엔드포인트와 앱 사용자(`yeogidam_app`) 비밀번호로 갈아끼웠다. 두 DB의 관리자(마스터) 비밀번호는 env에 없고 팀이 비밀값을 두는 곳에만 있다.

값만 고치면 반영되지 않는다. `--env-file`은 컨테이너를 만들 때만 읽히고 `deploy.sh`는 같은 이미지면 컨테이너를 교체하지 않으므로, 배포를 다시 돌려도 env는 그대로다. 그래서 env를 고친 뒤에는 손배포한다. `Infra/scripts/restart-backend.sh`를 서버에 복사해 `sudo bash`로 돌리면 `deploy.sh`와 같은 옵션으로 `current` 이미지를 다시 띄우고 healthy까지 기다린다. 롤백은 없으니 healthy가 안 되면 env를 되돌리고 다시 돌린다. 배포 워크플로가 도는 중에는 돌리지 않는다(#267). 2026-10-02 운영 RDS 전환 때는 이 스크립트가 머지되기 전이라 `docker rm -f` 뒤 `be-release` 마지막 실행의 Re-run으로 했고, `be-release`에 그 뒤 커밋이 없어 Re-run이 통했다. Re-run은 그 뒤에 커밋이 하나라도 들어가면 「Validate Deployment Target」이 거부한다. 코드 변경 없이 지금 HEAD로 다시 배포할 때는 `gh workflow run backend-cd.yml --ref be-dev`로 부르는데, 이 트리거는 파일이 `main`에 올라간 뒤부터 부를 수 있고 env 변경을 반영하지는 않는다.

손으로 고칠 때는 `sudo -u github-runner vi`로 연다. 소유권이 바뀌면 배포가 env 파일을 못 읽는다. 따옴표와 끝 공백과 CRLF를 넣으면 `deploy.sh`의 프로필 대조가 막는다.

깃허브 저장소 설정에 다음이 있어야 배포가 돈다.

| 종류 | 이름 |
| --- | --- |
| variable | `DOCKERHUB_IMAGE`, `DOCKERHUB_USERNAME`, `BACKEND_ENV_FILE`, `BACKEND_HOST_PORT` |
| secret | `DOCKERHUB_TOKEN` (CI, push용), `DOCKERHUB_READ_TOKEN` (러너, pull 전용) |

## ADR별 구현 현황

### 인프라 ADR-01 Docker 이미지 식별 및 롤백 보존

`.github/workflows/backend-cd.yml`과 `Backend/scripts/deploy.sh` 기준이다.

| 결정 항목 | 상태 |
| --- | --- |
| digest로 고정해 배포 | 됨. `publish` 잡이 digest를 출력하고 `deploy`가 `repository@sha256:...`로 받는다 |
| Git SHA 태그를 추적용으로 병행 | 됨. `deploy.sh`가 pull 직후 커밋 SHA 태그를 붙인다 |
| 역할 태그 `current`, `previous`, `candidate` | 됨. `tag_candidate_image`와 `promote_role_tags`가 처리한다 |
| 삭제 금지 목록 먼저 만들고 정리 | 됨. `prune_backend_images`가 보존 대상을 못 찾으면 정리를 건너뛴다 |
| `docker image prune` 금지 | 됨. `yeogidam/backend` 저장소만 지운다 |
| 헬스 실패 시 직전 이미지로 롤백 | 됨. `rollback_and_fail`이 `previous`로 복구한다 |
| **Build Once, Promote** | **됨(2026-09-29), 실측 2026-09-30.** `resolve-source-commit.sh`가 승격을 판정한다. 운영 첫 배포에서 publish의 빌드 스텝이 스킵되고 개발과 같은 digest가 운영에 갔다. 아래 참고 |
| 배포 이력을 서버 외부에 기록 | 안 됨. `GITHUB_STEP_SUMMARY`까지다 |
| 동일 Git SHA 태그 재push 차단 | 부분. `Check Existing SHA Image`가 있으면 재사용하고 덮어쓰지는 않는다 |
| 레지스트리 보존 정책 | 안 됨 |
| DB 마이그레이션 호환성 정책 | 안 됨. 스키마는 dev와 prod에 손으로 적용한다. 운영 첫 스키마는 2026-10-02에 `schema.sql`을 RDS에 그대로 넣었고, 이 파일은 DROP TABLE로 시작하므로 운영에 다시 돌리면 안 된다 |

#### Build Once, Promote를 지키는 방법

**원래 문제는 이랬다.** `publish` 잡이 이미지 태그를 `${{ vars.DOCKERHUB_IMAGE }}:${{ github.sha }}`로 만들고 그 태그가 레지스트리에 있으면 재사용하는데, `be-dev`에서 `be-release`로 머지하면 **새 커밋 SHA가 생긴다.** 그래서 운영 배포 때 태그를 못 찾고 새로 빌드했다. 도커 빌드는 재현 가능하지 않으므로 digest가 달라지고, 개발에서 검증한 그 이미지가 운영에 가지 않는다.

**2026-09-29에 `Backend/scripts/resolve-source-commit.sh`로 해결했다.** `be-release`에 들어온 커밋의 두 번째 부모를 승격 대상으로 잡고, 그 커밋이 정말 `be-dev`의 조상인지 `git merge-base --is-ancestor`로 확인한 뒤 재빌드 없이 그 이미지를 배포한다. 조상 관계를 부모 수보다 **먼저** 보기 때문에, hotfix를 머지 커밋으로 넣어도 승격으로 새어 나가지 않는다. 결정은 [인프라 ADR-05](adr-05-branch-strategy.md)에 있고 판정표는 아래 「승격 판정」에 있다.

**두 번 돌았다.** 2026-09-30 첫 출시와 2026-10-01 두 번째 출시(#266) 모두 `mode=promote`로 가서 publish의 빌드 스텝이 스킵되고 개발과 같은 digest가 운영에 갔다.

### 인프라 ADR-02 CI/CD 실행 전략

| 결정 항목 | 상태 |
| --- | --- |
| CI는 GitHub-hosted, CD는 EC2 self-hosted | 됨. `verify`와 `publish`는 GitHub-hosted, `deploy`는 `self-hosted, linux, ARM64, backend-{development,production}` |
| PR이 운영 Runner와 Secret에 닿지 않음 | 됨. `publish`와 `deploy`가 `if: github.event_name == 'push'`로 막혀 있고 PR에서는 `verify`만 돈다 |
| 헬스 polling으로 판정 | 됨. `wait_for_healthy`가 `/actuator/health/liveness`를 본다. 기동만으로 성공 처리하지 않는다 |
| concurrency group과 호스트 lock 병행 | 됨. 워크플로 레벨과 `deploy` 잡 레벨 concurrency, `deploy.sh`의 flock |
| pull 전용 자격 증명 분리 | 됨. CI는 `DOCKERHUB_TOKEN`, 러너는 `DOCKERHUB_READ_TOKEN` |
| 배포마다 임시 `DOCKER_CONFIG` | 됨. 실행마다 만들고 `logout: true` |
| 오래된 실행 차단 | 됨(문서에 없던 추가). 배포 전에 원격 HEAD SHA와 대조한다 |
| 배포 전 프로필 대조 | 됨(문서에 없던 추가). env 파일의 `SPRING_PROFILES_ACTIVE`를 기대값과 맞춰 본다 |
| **Production Environment 승인** | **안 됨.** `deploy` 잡에 `environment:`가 없다 |
| **외부 Action을 commit SHA로 고정** | **안 됨.** `actions/checkout@v7`처럼 태그로 고정되어 있다 |
| `GITHUB_TOKEN`을 Job별 최소 범위로 | 부분(2026-09-29). `publish` 잡만 `contents: read`와 `pull-requests: read`로 좁혔다. `verify`와 `deploy`는 워크플로 레벨을 따른다 |
| CODEOWNERS와 필수 리뷰 | 부분. 필수 리뷰는 ruleset으로 강제된다(be-dev와 be-release 승인 1개, main 2개). CODEOWNERS 파일은 없다 |
| 배포 이력을 서버 외부에 기록 | 안 됨(ADR-01과 같은 항목) |
| Runner 복구 Runbook | 안 됨 |
| 자원과 OOM 모니터링 | 됨(2026-10-01, RDS는 2026-10-02). 상한은 코드에 있다(512m / 768m). 앱 컨테이너는 `awslogs` 드라이버로, nginx와 개발 MySQL 로그와 메모리, 디스크 지표는 CloudWatch 에이전트로, 운영 RDS의 error와 slowquery 로그는 로그 내보내기로 CloudWatch에 간다(#251, #272). 지표 필터 4개, 알람 8개, 대시보드 1개, SNS와 Lambda를 거친 Discord 알림까지 콘솔에 있고 두 환경에서 드릴로 확인했다. 이름과 절차는 [observability.md](observability.md)에 있다 |

### 인프라 ADR-03 EC2 인스턴스 아키텍처

ARM64(Graviton)를 쓴다는 결정은 맞고 구현도 따라왔다. CI 러너를 `ubuntu-24.04-arm`으로 바꿨고 이미지도 arm64다.

**인스턴스 사양은 문서와 실물이 다르고, 문서 안에서도 값이 갈린다.**

| 위치 | 적힌 값 |
| --- | --- |
| 머리 속성 표의 ADR 번호 | `ADR-02` (데이터베이스 Select 값은 `ADR-03`) |
| 결정 요약 | t4g.small |
| 결정 첫 줄 | t4g.micro |
| 결정 둘째 줄 | 유형 t4g.small, 스토리지 gp3 20GB |
| **실물** | **앱 서버 t4g.micro 두 대(디스크 각 8GB, 스왑 2GB), 개발 DB 서버 t4g.micro 한 대(15GB), 운영 DB는 RDS db.t4g.micro(gp3 20GB)** |

「결정」의 첫 줄에 적힌 `ARM 아키텍처의 t4g.micro 인스턴스를 채택한다`가 실물과 맞는 줄이다.

**ADR-03이 기각한 선택지 C가 실제로 돌고 있다.** 선택지 C는 `t4g.micro`에 스왑 2GB를 붙이는 안이었고, "배포 시점마다 응답이 느려진다"는 이유로 채택하지 않았다. 그런데 실물은 t4g.micro이고 양쪽 서버에 `/swapfile` 2GB가 붙어 있다. 910Mi밖에 없는 기계에서는 스왑이 안전망이므로 되돌릴 이유는 없고, 기록만 어긋나 있다.

**개발 서버 사양은 정해졌고 구축까지 끝났다(2026-09-29).** 세 후보 중 **DB 인스턴스를 따로 띄우는 안**으로 갔다. 앱 서버를 키우지 않고 `yeogidam-dev`는 앱만 돌리며, `yeogidam-dev-db`가 MySQL을 맡는다. 새 ADR로 남겨야 한다.

**개발 서버 앞단은 2026-09-30에 올렸다.** nginx 1.30이 호스트에 systemd 서비스로 돌고 443에서 Let's Encrypt 인증서(2026-12-29 만료)를 들고 `127.0.0.1:8080`으로 넘긴다. 80은 인증서 검증 경로만 열고 나머지는 443으로 보내며, 이름 없이 IP로 오는 요청은 거절하고 `/actuator`는 밖에서 404다. certbot은 dnf에 없어 `/opt/certbot` venv에 깔았고 `certbot-renew.timer`가 하루 두 번 확인해 갱신되면 nginx만 reload한다. 설정 원본은 `Infra/nginx/nginx.conf.template`이고 도메인은 `${SERVER_NAME}` 자리표라 저장소에 남지 않으며, 설치 절차는 `Infra/scripts/bootstrap-host.sh` 한 파일이라 서버가 늘면 그것만 다시 돌린다. 앱 쪽은 `application.yml`에 `server.forward-headers-strategy: native`를 더해 톰캣이 루프백에서 온 `X-Forwarded-*`만 믿게 했다. nginx를 컨테이너로 두지 않은 이유는 910Mi에서 컨테이너를 더 늘릴 여유가 없고 인증서 갱신이 앱과 분리되기 때문이다. 운영 서버에도 같은 날 같은 스크립트로 올렸고, 밖에서 같은 다섯 가지(502, 인증서, http→https, `/actuator` 404, IP 직접 접속 거절)를 확인했다. 2026-10-01에 요청 제한을 더했다(#251). IP당 초당 10회(순간 30회), 로그인과 재발급 경로(`/api/v1/auth/`)는 분당 10회(순간 20회), 동시 연결 20개, 본문 16KB, 헤더와 본문 타임아웃 10초이고 넘치면 429를 돌려준다. 거절된 요청은 앱까지 가지 않아 제공자 호출과 톰캣 스레드와 앱 로그가 생기지 않으며, 429는 access 로그에도 남기지 않아 폭주가 CloudWatch 요금이 되지 않는다. 템플릿을 바꾼 것이라 서버에서 `bootstrap-host.sh`를 다시 돌려야 반영된다.

**운영 DB는 2026-10-02에 RDS로 올렸다(#272).** 식별자 `yeogidam-prod-db`, MySQL 8.4.11, `db.t4g.micro`(2 vCPU, 1GiB), gp3 20GiB다. 저장 공간 자동 확장은 껐다. 켜 두면 차오를 때 AWS가 저장 공간을 늘리고 그만큼 요금이 붙는데 삭제 권한이 없는 계정이라 되돌리지도 못하므로, 대신 남은 공간 알람(`yeogidam-prod-rds-storage`, 2GiB 미만)을 둔다. 단일 AZ `ap-northeast-2a`에 두어 앱 서버와 같은 AZ라 둘 사이 전송 요금이 없고, 공개 접근은 없으며 보안 그룹은 `project-db`다. 서브넷 그룹은 우테코가 준비한 것을 썼다. 팀이 서브넷 그룹을 만드는 것은 `techcourse-project-rds` 정책이 명시적으로 거부한다. 파라미터 그룹 `yeogidam-prod-mysql84`에 `slow_query_log=1`, `long_query_time=0.5`를 주어 개발 DB의 `observability.cnf`와 같은 기준이고, `time_zone`은 기본값 UTC라 `DB_URL`의 `connectionTimeZone=UTC`와 맞는다. 로그 내보내기는 error와 slowquery만 켰다. 백업은 자동 7일에 스냅샷으로 태그 복사, 암호화는 기본 키 `aws/rds`, 삭제 방지 켬, 유지보수 창은 일요일 18:00 UTC(월요일 새벽 3시 KST) 30분이다. Performance Insights는 micro 클래스가 지원하지 않고 Enhanced Monitoring은 IAM 역할(`rds-monitoring-role`)을 만들 수 없어 둘 다 껐다. 마스터 사용자는 `yeogidam_admin`(스키마 적용용)이고, 앱은 `yeogidam.*`에 SELECT, INSERT, UPDATE, DELETE만 가진 `yeogidam_app`으로 붙는다. 스키마는 운영 앱 서버에서 `dnf install mariadb105`로 깐 클라이언트로 `be-release`의 `schema.sql`을 넣어 테이블 10개를 만들었다(RDS는 사설 서브넷에만 있어 앱 서버가 유일하게 닿는 자리이고, `caching_sha2_password` 때문에 `--ssl`이 필요하다). env를 바꾸고 컨테이너를 다시 만든 뒤 `/actuator/health`가 DB 포함 `UP`인 것과 `SELECT SLEEP(1)`이 slowquery 로그 그룹에 도착하는 것을 확인했다. 월 비용은 약 20달러(인스턴스 약 18, 저장 약 2.6, 백업은 20GB까지 무료)로 전체 약 60달러가 되어 한도 70달러 안이다. 개발 DB를 EC2 Docker로 둔 이유는 아래 「확인이 필요한 것」 4번이다.

### 인프라 ADR-04 모노레포 브랜치 전략

Superseded다. [인프라 ADR-05](adr-05-branch-strategy.md)가 대신한다.

### 인프라 ADR-05 분야별 트렁크와 출시 브랜치 전략

| 결정 항목 | 상태 |
| --- | --- |
| 브랜치 여섯 종류 | 됨 |
| main 진입 규칙 | 됨. `require-develop-for-main.yml`이 `be-release`와 `fe-release/*`만 허용한다 |
| CI는 PR만, CD는 머지 뒤 | 됨(2026-09-29). `backend-ci.yml`의 push 트리거를 뗐다 |
| `be-release` 승격 | 됨(2026-09-29). `Backend/scripts/resolve-source-commit.sh`가 판정한다. 2026-09-30과 2026-10-01(#266) 두 번 `promote`로 돌았다 |
| 머지 방식 강제 | 됨(2026-09-29). ruleset `Backend Release Protection`의 `allowed_merge_methods`가 `["merge"]`다 |
| `hotfix` 라벨 | 됨(2026-09-29) |
| `be-release` 필수 체크 | 됨(2026-09-29). `Backend Verification`만 남았다. `Require branches to be up to date`는 2026-10-01에 껐다. 출시 PR의 head는 `be-dev`인데 base의 최신 커밋은 지난 출시의 merge 커밋이고 `be-dev`가 그 커밋을 품을 수 없어, 두 번째 출시(#266)부터 이 요구가 항상 막았다 |
| `be-dev` 브랜치 보호 | 됨(2026-09-29). ruleset `Backend Development Protection`. 삭제와 강제 푸시와 재생성 금지, PR 필수에 승인 1개, 머지 방식은 **squash만**, 필수 체크 `Build Pull Request`에 최신 base 요구 |
| `main` 브랜치 보호 | 됨(2026-09-29). ruleset `Protect main`. 삭제와 강제 푸시 금지, PR 필수에 승인 2개, 머지 방식은 **merge만**, 필수 체크 `Require develop source branch` |

세 브랜치의 머지 방식이 서로 다른 것은 실수가 아니라 승격 때문이다. `be-dev`가 squash여야 `rev-list`가 이미지 있는 커밋을 돌려주고, `be-release`가 merge여야 두 번째 부모를 읽을 수 있다. `main`이 merge인 것은 이력을 잇기 위해서다. squash로 넣으면 공통 조상이 움직이지 않아 다음 출시 PR마다 이전 커밋이 전부 다시 올라온다.

### 승격 판정

`Backend/scripts/resolve-source-commit.sh`가 어떤 이미지를 배포할지 정해 `IMAGE_TAG`로 넘긴다.

| 조건 | 결과 |
| --- | --- |
| `be-release`가 아니다 | `build`. 자기 SHA로 빌드한다 |
| 두 번째 부모가 `be-dev`의 조상이다 | `promote`. 그 코드를 만든 커밋의 이미지를 쓴다 |
| 브랜치가 `hotfix/`이고 PR에 `hotfix` 라벨이 있다 | `build`. 자기 SHA로 빌드한다 |
| 그 밖 | 배포를 거부한다 |

두 번째 부모가 문서만 고친 커밋이면 그 SHA로 만든 이미지가 없다. `backend-cd.yml`의 push `paths`가 `Backend/docs`와 `README.md`를 빼기 때문이다. 그래서 같은 코드 상태를 만든 가장 최근 커밋을 찾아 쓴다.

```bash
git rev-list -1 "$SECOND_PARENT" -- 'Backend' ':(exclude)Backend/docs' ':(exclude)Backend/README.md'
```

승격 모드인데 이미지가 없으면 빌드로 흘러가지 않고 실패한다. 그 커밋의 `be-dev` 배포가 실패했거나 아직 안 끝났다는 뜻이고, 여기서 빌드하면 검증하지 않은 이미지가 운영에 올라간다.

### PR 트리거에 `paths`를 걸지 않는다

`backend-ci.yml`과 `backend-cd.yml`의 `pull_request` 트리거에는 `paths`가 없다. 필수 체크로 잡아 둔 잡이 `paths`에 안 걸려 돌지 않으면 체크가 생기지 않고, 깃허브는 체크를 기다리는 상태로 두어 문서만 고친 PR이 영원히 머지되지 않는다.

배포를 거는 `push` 트리거에는 `paths`가 그대로 있다. 문서만 고쳤을 때 배포가 나가지 않게 한다.

### 첫 배포 실측 (2026-09-30)

PR #226이 `be-dev`에 머지되어 `Backend CD`가 처음 돌았고, 같은 날 롤백 시험 두 번, 두 번째 정상 배포, `be-release` 승격으로 운영 첫 배포까지 갔다. 상황판의 여덟 항목을 서버에서 실측으로 확인했다.

| 항목 | 확인한 것 |
| --- | --- |
| 이미지 빌드와 push | arm64 이미지가 Docker Hub에 올라갔고 digest가 서버와 일치한다 |
| digest 고정 배포 | 컨테이너 이미지와 `current` 태그의 RepoDigest가 Summary의 digest와 같다 |
| 헬스 판정 | healthy 뒤 성공으로 끝나고, unhealthy면 롤백으로 간다 |
| 프로필 대조 | env 대조를 지나 컨테이너 단계로 간다 |
| 자원 상한과 로그 | `--memory` 512MiB, `--memory-swap` 768MiB, 로그 10m 3개가 컨테이너에 걸렸다. 힙 256MB, 실사용 197MiB. (2026-10-01부터 로그는 `awslogs`로 CloudWatch에 가고 10m 3개는 `docker logs`용 로컬 캐시 상한이다) |
| 롤백 | `BACKEND_MEMORY_LIMIT=64m`으로 새 컨테이너만 OOM으로 죽게 해서 두 번 돌렸고, 두 번 다 옛 컨테이너가 원래 상한으로 복구됐다 |
| 역할 태그 | 두 번째 배포 뒤 `current`는 새 ID, `previous`는 옛 ID다. `candidate`는 배포 중에만 있다 |
| 이미지 정리 | 두 번째 배포에서 롤백 시험이 남긴 이미지가 지워지고 `current`와 `previous`만 남았다 |
| `be-release` 승격 | 머지 커밋의 두 번째 부모를 잡아 `mode=promote`로 갔다. publish의 빌드 스텝이 스킵되고 운영이 개발과 같은 digest `f1815ebe`를 받았다 |
| 앱→DB | 개발: 카카오 로그인으로 `members`에 행이 생겼다. 앱 서버에서 앱 계정으로 `SELECT 1`도 확인했다. 운영: 2026-10-02 RDS 연결 뒤 `/actuator/health`가 DB 포함 `UP` |
| 재부팅 복구 | 개발 앱 서버를 `sudo reboot`했더니 ssh 25초, 앱 healthy 53초 만에 돌아왔고 러너와 `certbot-renew.timer`도 저절로 올라왔다. nginx와 도커는 systemd enable, 앱은 `--restart unless-stopped`, 러너는 `svc.sh` 서비스라서다. 개발 DB 서버는 재부팅하지 않고 조건만 봤는데 도커 enable, `yeogidam-mysql`이 `unless-stopped`, 데이터는 이름 있는 볼륨 `yeogidam-mysql-data`라 같은 방식으로 돌아온다. 운영 앱 서버도 2026-10-01에 재부팅했고(5주 만의 첫 재부팅) ssh 22초, 앱 healthy 50초, nginx와 러너와 타이머가 저절로 올라왔으며 깃허브에서 러너가 online으로 돌아왔다 |

알게 된 것.

- 첫 실행은 러너 서버에 `git`이 없어 「Validate Deployment Target」에서 멈췄다. `dnf install git` 뒤 재실행해서 통과했고, `bootstrap-host.sh`의 패키지에 `git`을 넣었다(#240).
- 깃허브의 Re-run은 repository variable을 원래 실행 시점 값으로 다시 쓴다. 변수를 바꾼 뒤에는 새 실행을 만들어야 한다.
- 포트가 하나라 옛 컨테이너를 먼저 멈추고 새 것을 띄우므로 배포마다 502가 난다. 정상 배포 10초, 롤백 시험 40초를 쟀다. 무중단이 필요해지면 두 포트를 번갈아 쓰고 nginx upstream을 바꾸는 방식이 필요하다.
- 롤백한 옛 컨테이너를 기다릴 때도 `BACKEND_HEALTH_TIMEOUT_SECONDS`를 그대로 썼다. 짧게 두면 복구가 되는데도 실패로 기록되므로 롤백 쪽은 최소 60초를 주도록 고쳤다(#242).
- `build-push-action`의 provenance 증명서 때문에 태그 하나가 세 조각으로 올라갔다. 읽는 곳이 없어 껐다(#240).
- 운영 DB는 2026-10-02까지 없어서 운영 앱이 떠 있어도 DB를 쓰는 요청은 실패했다. RDS를 만들고 env를 바꾼 뒤 사라졌다(위 ADR-03 절).

## AWS 리소스 목록

우테코 공용 계정(서울 리전)에 팀이 만든 것이다. 모두 태그 `Service=techcourse`, `Role=techcourse-etc`, `ProjectTeam=yeogidam`가 있어야 하고, 2026-10-02에 전부 확인했다. 태그 칸이 없는 종류는 비고에 적었다. 리소스를 만들거나 지우면 이 표와 팀 노션 Infra 페이지의 같은 표를 함께 고친다. 삭제 권한이 없으므로 이름을 바꾸거나 지우려면 관리자에게 부탁한다. IP와 도메인은 공개 저장소 규칙에 따라 적지 않는다.

| 종류 | 이름 | 만든 날 | 비고 |
| --- | --- | --- | --- |
| EC2 | `yeogidam-prod` | 2026-08 | t4g.micro, 운영 앱, EIP |
| EC2 | `yeogidam-dev` | 2026-09-29 | t4g.micro, 개발 앱, EIP |
| EC2 | `yeogidam-dev-db` | 2026-09-29 | t4g.micro, 개발 DB, 공인 IP 없음 |
| EBS | 위 세 대의 루트 볼륨 | 인스턴스와 같이 | 8GB, 8GB, 15GB. 인스턴스와 별개 리소스라 볼륨에도 태그를 달았다(2026-10-02 확인) |
| EIP | 운영, 개발 각 1개 | 인스턴스와 같이 | 태그 있음(2026-10-02 확인) |
| 키 페어 | 서버 접속용 | 인스턴스와 같이 | 태그 있음(2026-10-02 확인) |
| RDS 인스턴스 | `yeogidam-prod-db` | 2026-10-02 | db.t4g.micro, gp3 20GB. 자동 백업과 스냅샷에 태그 복사 |
| RDS 파라미터 그룹 | `yeogidam-prod-mysql84` | 2026-10-02 | mysql8.4 패밀리 |
| 로그 그룹 | `/yeogidam/dev/backend`, `/yeogidam/dev/nginx`, `/yeogidam/dev/mysql`, `/yeogidam/prod/backend`, `/yeogidam/prod/nginx` | 2026-10-01 | 보존 1개월 |
| 로그 그룹 | `/aws/rds/instance/yeogidam-prod-db/error`, `/aws/rds/instance/yeogidam-prod-db/slowquery` | 2026-10-02 | 보존 1개월. RDS보다 먼저 태그와 함께 만들었다 |
| 로그 그룹 | `/aws/lambda/yeogidam-alerts-to-discord` | Lambda 첫 실행 때 자동 | Lambda가 태그 없이 만든 것이라 2026-10-02에 태그를 달았다 |
| 지표 필터 | `nginx-5xx`, `app-error` × dev, prod | 2026-10-01 | 태그 칸 없음. 로그 그룹에 속한다 |
| 알람 | `yeogidam-dev-nginx-5xx`, `yeogidam-dev-app-error`, `yeogidam-dev-disk-app`, `yeogidam-dev-disk-db`, `yeogidam-prod-nginx-5xx`, `yeogidam-prod-app-error`, `yeogidam-prod-disk` | 2026-10-01 | Tag Editor로 태그 |
| 알람 | `yeogidam-prod-rds-storage` | 2026-10-02 | Tag Editor로 태그(2026-10-02 확인) |
| 대시보드 | `yeogidam-observability` | 2026-10-01 | 태그 칸 없음. 이름에 팀 이름이 들어가면 된다 |
| SNS 토픽 | `yeogidam-alerts` | 2026-10-01 | 구독 2건(메일, Lambda)은 토픽에 속한다 |
| Lambda | `yeogidam-alerts-to-discord` | 2026-10-01 | Python 3.13, 실행 역할 `techcourse-lambda-execution-role` |

우테코가 준비해 둔 것을 쓰는 것은 VPC `TECHCOURSE-PROJECT`, 서브넷 `project-public-a`와 `project-storage-a/b`, 보안 그룹 `project-public`과 `project-db`, RDS 서브넷 그룹, IAM 역할 `ec2-project`와 `techcourse-lambda-execution-role`, S3 버킷 `techcourse-project-2026`이다. 팀이 만든 것이 아니라 태그 책임도 없다.

## 안 한 것

급한 순서다.

1. **관측에서 남은 것.** 스프린트 1 조건(로그 보존, 대시보드 지표, 팀에 닿는 알림, 두 환경, 사고 기록 1건)은 2026-10-01에 찼고 운영 RDS도 2026-10-02에 관측 범위에 들어왔다. 이름과 절차는 [observability.md](observability.md), 사고 기록은 [incidents/](incidents/)에 있다. 남은 것은 출시 뒤 `prod` 로그 그룹 보존을 3개월로 늘리기, 개발 알람이 운영 알람을 묻으면 Discord 채널과 SNS 토픽을 환경별로 나누기, 5xx 알람을 건수에서 비율로 바꾸기, 밖에서 443을 찔러 보는 외부 헬스 체크다.
2. **배포 Job에 `environment:`가 없다.** Production 승인 관문이 ADR-02의 결정인데 빠졌다. 환경별로 다른 변수를 주려면 이것이 먼저 있어야 한다. 지금은 저장소 변수 하나를 개발과 운영이 같이 쓴다.
3. **외부 Action이 태그로 고정되어 있다.** ADR-02는 commit SHA 고정을 요구한다.
4. **`permissions`가 대부분 워크플로 레벨이다.** publish 잡만 `contents: read`와 `pull-requests: read`로 좁혔다(2026-09-29). verify와 deploy 잡은 아직 워크플로 레벨을 따른다.
5. **배포 이력이 서버 외부에 없다.** `GITHUB_STEP_SUMMARY`까지다.
6. **env를 손으로 채웠다.** 서버가 날아가면 무슨 키가 있었는지 남지 않는다. 비비디는 env 전문을 깃허브 시크릿에 넣고 배포 때 서버에 떨어뜨린다.
7. **DB 마이그레이션 도구가 없다.** 개발 DB(2026-09-29, `yeogidam-dev-db`의 Docker MySQL)와 운영 DB(2026-10-02, RDS `yeogidam-prod-db`)가 다 있고 스키마는 양쪽 다 `schema.sql`을 손으로 넣었다. 다음 스키마 변경부터는 바뀐 문장만 골라 두 DB에 손으로 적용해야 하고, `schema.sql`은 DROP TABLE로 시작해 운영에 다시 돌릴 수 없다. 컷오버 전에 Flyway를 넣는다.
8. **운영 디스크가 빠듯하다.** 2026-09-29에 러너 옛 버전 448MB를 지워 여유가 2.3G에서 2.7G로 늘었다. 그래도 8GB 중 2GB를 `/swapfile`이 가져가 실제로 쓸 수 있는 것은 6GB다. `current`와 `previous`와 `candidate` 세 이미지를 보존하려면 1GB 가까이 필요하다. journal은 상한이 없어 운영 256MB, 개발 185MB까지 자랐다. `ec2-user`의 `~/.warp` 196MB도 지울 수 있는데 아직 안 지웠다.
9. **린터와 커버리지가 없다.** Gradle에 checkstyle도 spotless도 jacoco도 없다. IDEA checkstyle 설정만 있다. CI가 `./gradlew build`라 `check`까지 도므로, 붙이기만 하면 PR 단계에서 걸린다.
10. **CODEOWNERS와 dependabot이 없다.**
11. **`project-public`에 8080이 `0.0.0.0/0`으로 열려 있다.** 공용 보안 그룹이라 우리가 닫을 수 없다. 2026-09-30에 `deploy.sh`의 바인딩 주소를 `127.0.0.1` 상수로 박고 `backend-cd.yml`에서 `BACKEND_BIND_ADDRESS` 변수를 지웠다. 그 전에는 repository variable 하나로 앱이 TLS 없이 인터넷에 노출될 수 있었는데, 이제 앱은 언제나 로컬에만 귀를 열고 밖으로 가는 길은 nginx 443뿐이다. 8080이 열려 있다는 사실은 그대로라서, 서버에서 다른 프로세스가 8080을 `0.0.0.0`으로 열면 여전히 노출된다.
12. **`backend-cd.yml`이 한 파일에 환경 둘을 담고 있다.** 307줄이고 `github.ref_name == 'be-release'` 삼항이 네 줄에 흩어져 있다(러너 라벨, concurrency group, 표시 이름, Spring 프로필). 환경이 늘면 네 줄을 다 고쳐야 하고 하나만 빠뜨리면 개발 브랜치가 운영 러너로 간다. `deploy.sh`의 프로필 대조가 그걸 잡으려고 있는 장치다. 아래 「나눌 때 참고」 참고.
13. **nginx 설정의 도메인이 어디에도 관리되지 않는다.** `bootstrap-host.sh`는 사람이 서버에서 `SERVER_NAME`을 명령줄에 쳐서 돌리고, 값은 렌더된 `/etc/nginx/nginx.conf`와 `/etc/letsencrypt/live/<도메인>/`에만 남는다. 서버가 날아가면 값을 알아야 하고 재실행 때마다 다시 쳐야 한다. 도메인은 DNS로 누구나 조회할 수 있어 비밀이 아니고, 저장소에 안 적는 이유는 우테코 공개 저장소 규칙이므로 팀 노션에는 적어도 된다. 최종 모습은 깃허브 Environments(`development`, `production`)에 `BACKEND_DOMAIN`을 두고, deploy 잡이 브랜치에 따라 환경을 골라 템플릿을 렌더해 서버에 반영하고 nginx를 reload하는 것이며, 2번(`environment:` 도입)과 같은 작업이다. 다만 스크립트는 사람이 sudo로 돌리는 것이라 깃허브 변수를 읽을 수 없고, CD가 nginx 설정을 쓰고 reload하려면 러너에 sudo가 필요하다. 비비디는 러너에 `NOPASSWD: ALL`을 줬는데 그러면 `be-release`에 머지할 수 있는 사람이 서버 root를 갖는 것이라 그렇게 하지 않는다. 두 단계로 간다.
    - **지금.** 첫 설치는 사람이 값을 쳐서 돌리고, 스크립트가 `/opt/yeogidam/host.env`(root 600)에 저장해 재실행 때는 안 쳐도 되게 한다. 러너 권한은 필요 없다. 아직 안 했다.
    - **다음 PR.** `environment:` 도입, `BACKEND_DOMAIN` 변수, CD가 템플릿을 렌더해 서버에 반영. sudoers에는 `nginx -t`, `systemctl reload nginx`, 설정 파일 복사 세 명령만 허용한다. 여기까지 가면 사람이 도메인을 치는 일은 서버를 처음 만들 때 인증서 발급 한 번뿐이고, 그 뒤로는 깃허브 변수가 유일한 원본이 된다.

## `backend-cd.yml`을 나눌 때 참고

비비디는 `workflow_call`을 쓰는 재사용 워크플로로 나눴다.

```
backend-dev-cd.yml     push: dev-be      → common 호출, 라벨과 프로필을 inputs로 넘긴다
backend-prod-cd.yml    push: release-be  → common 호출
backend-common-cd.yml  on: workflow_call, 실제 일을 전부 여기서 한다
```

환경별 진입점이 20줄이고 차이가 `inputs`로 드러난다. 삼항이 사라진다.

**얻는 것.** 환경 차이가 한 군데에 모인다. ADR-02가 요구하는 `environment:` 승인 관문을 prod 파일에만 한 줄로 붙일 수 있다. 스테이징이 생기면 진입점 하나만 더 만든다.

**치르는 것.** `secrets: inherit`을 쓰면 호출된 워크플로가 저장소 시크릿을 전부 본다. 이름을 하나씩 넘기면 막을 수 있지만 진입점이 길어진다. ADR-02의 최소 권한과 부딪히는 지점이라 나눌 때 정해야 한다. 디버깅할 때 파일을 오간다.

**언제 할지.** 첫 배포가 성공한 뒤에 하기로 했고 2026-09-30에 성공했으므로 조건은 찼다. 검증하지 않은 워크플로를 쪼개면 실패했을 때 원인이 원래 로직인지 쪼개며 생긴 것인지 가리기 어려웠는데, 이제는 쪼개기 전후로 개발 배포를 한 번씩 돌려 결과를 비교할 기준이 있고 `workflow_dispatch`(#267)로 코드 변경 없이 배포를 부를 수 있어 비교도 쉽다.

`github.ref_name`이 재사용 워크플로 안에서 호출한 쪽 ref를 가리키는지 확인해야 한다. `Backend/scripts/resolve-source-commit.sh`가 그 값으로 분기한다.

## 확인이 필요한 것

ADR을 고치거나 새로 쓰려면 이유를 알아야 하는데 어디에도 기록이 없다. 빈에게 물어서 채운다.

1. **왜 t4g.small이 아니라 t4g.micro로 만들었나.** 비용 때문이면 새 ADR로 남길 결정이고, 문서를 t4g.small로 적어 놓고 콘솔에서 micro를 고른 것이면 문서 오기다.
2. **디스크를 왜 8GB로 했나.** ADR-03은 gp3 20GB로 적었다. 생성 화면 기본값을 그대로 둔 것인지 확인한다. 지금 운영이 72% 찬 상태라 이미지 세 개를 보존하기에 빠듯하다.
3. **개발 서버를 언제 왜 만들었나.** ADR-03은 운영 인스턴스 한 대만 다룬다. 개발 서버는 결정 기록이 없는 리소스다.
4. **개발은 Docker MySQL, 운영은 RDS로 가른 이유가 무엇인가.** 2026-09-28에 빈이 정한 이유는 운영만 관리형으로 두어 백업과 시점 복원 부담을 덜고, 개발은 비용 때문에 EC2에 얹는다는 것이다. 둘 다 만들어졌으니(2026-09-29, 2026-10-02) 이 이유를 새 ADR에 적는다.
5. **운영의 `/home`이 개발보다 1.25GB 큰 이유 중 절반이 아직 안 밝혀졌다.** 2026-09-29에 러너 옛 버전 디렉터리 448MB를 찾아 지웠고, `ec2-user`의 `~/.warp`가 196MB를 쓰는 것도 확인했지만 아직 안 지웠다. 둘을 합쳐 644MB라 나머지 600MB 남짓이 어디에 있는지 모른다. `sudo du -h --max-depth=2 /home | sort -rh | head -20`으로 끝내면 된다.

### 답이 나온 것

- **스왑.** 양쪽 서버에 `/swapfile` 2GB가 붙어 있고 swappiness는 60이다(2026-09-29 실측). ADR-03이 기각한 선택지 C가 그대로 돌고 있다.
- **개발 서버 사양.** DB 인스턴스를 따로 띄우기로 했고 `yeogidam-dev-db`를 만들었다(2026-09-29). `yeogidam-dev`는 앱만 돌린다.
- **운영 DB.** RDS `yeogidam-prod-db`(db.t4g.micro, gp3 20GB)로 만들었다(2026-10-02). 사양과 설정은 ADR-03 절에 있다.

답이 모이면 **인프라 ADR-06 「서버 구성과 DB 배치」**를 써서 지금 실물을 결정으로 남기고, ADR-03의 사양 부분을 그 문서가 대신하게 한다. 개발용 DB를 별도 인스턴스에 두는 결정과 스왑을 쓰는 상태도 같이 담는다.
