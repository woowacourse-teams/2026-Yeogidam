# 인프라 현재 상태

지금 실제로 돌아가는 것과 ADR이 정했는데 아직 못 한 것을 적는다. **ADR은 결정 기록이라 함부로 고치지 않지만 이 문서는 바뀔 때마다 고친다.** 인프라를 건드리는 PR은 이 문서도 같이 고친다.

마지막 갱신 2026-09-29.

## 서버

| | 운영 | 개발 |
| --- | --- | --- |
| 이름 | `yeogidam-prod` | `yeogidam-dev` |
| 인스턴스 | t4g.micro | t4g.micro |
| 메모리 | 1GiB | 1GiB |
| 디스크 | 8GB | 8GB |
| OS와 아키텍처 | AL2023, arm64 | AL2023, arm64 |
| 탄력적 IP | <운영 EIP> | <개발 EIP> |
| DDNS | `yeogidam` | `yeogidam-dev` |
| 러너 라벨 | `backend-production` | `backend-development` |
| 러너 계정 | `github-runner` (docker 그룹) | `github-runner` (docker 그룹) |
| 올라간 것 | 앱 컨테이너 | 앱 컨테이너 |
| DB | RDS 예정, 아직 없음 | EC2 Docker MySQL 예정, 아직 없음 |

[인프라 ADR-03](adr-03-ec2-architecture.md)이 적은 t4g.small과 gp3 20GB와 다르다. 아래 「확인이 필요한 것」 참고.

보안 그룹은 `project-public`이고 SSH(22번)는 우테코 캠퍼스와 VPN 회선에서만 열린다. 밖에서는 AWS Session Manager로 붙는다.

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

**바인드가 `127.0.0.1`이라 밖에서 닿지 않는다.** 앞단이 없어서 지금 배포해도 클라이언트가 붙을 수 없다.

## 환경 설정

각 서버의 `/opt/yeogidam/backend.env`에 다섯 키가 있다. 소유는 `github-runner`이고 권한은 600이다.

```
SPRING_PROFILES_ACTIVE
DB_URL
DB_USERNAME
DB_PASSWORD
JWT_SECRET
```

비밀값은 각 서버에서 `openssl`로 만들어 넣었다. `DB_URL`은 시간대 파라미터(`connectionTimeZone=UTC&forceConnectionTimeZoneToSession=true&preserveInstants=true`)까지 갖춘 자리표이고, **운영은 RDS를 만든 뒤 주소와 비밀번호를 갈아끼워야 한다.**

값만 고치면 반영되지 않는다. `--env-file`은 컨테이너를 만들 때만 읽히고 `deploy.sh`는 같은 이미지면 컨테이너를 교체하지 않으므로, 서버에서 `docker rm -f yeogidam-backend`를 한 뒤 워크플로를 다시 돌려야 한다.

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
| **Build Once, Promote** | **안 됨.** 아래 참고 |
| 배포 이력을 서버 외부에 기록 | 안 됨. `GITHUB_STEP_SUMMARY`까지다 |
| 동일 Git SHA 태그 재push 차단 | 부분. `Check Existing SHA Image`가 있으면 재사용하고 덮어쓰지는 않는다 |
| 레지스트리 보존 정책 | 안 됨 |
| DB 마이그레이션 호환성 정책 | 안 됨. 스키마는 dev에 손으로 적용한다 |

#### Build Once, Promote를 못 지키는 이유

`publish` 잡이 이미지 태그를 `${{ vars.DOCKERHUB_IMAGE }}:${{ github.sha }}`로 만들고, 그 태그가 레지스트리에 이미 있으면 재사용한다. 그런데 `be-dev`에서 `be-release`로 머지하면 머지 커밋이든 squash든 rebase든 **새 커밋 SHA가 생긴다.** 그래서 운영 배포 때 태그를 찾지 못하고 새로 빌드한다. 도커 빌드는 재현 가능하지 않으므로 digest가 달라지고, 개발에서 검증한 그 이미지가 운영에 가지 않는다. ADR-01이 막으려던 상황이 그대로 일어난다.

고치려면 승격 판정을 넣어야 한다. `be-release`에 들어온 커밋이 부모 두 개인 머지 커밋이면 두 번째 부모를 승격 대상으로 잡고, 그 커밋이 정말 `be-dev`의 조상인지 `git merge-base --is-ancestor`로 확인한 뒤 재빌드 없이 그 이미지를 배포한다. 부모가 하나이면 hotfix 경로인지 확인한 뒤에만 새로 빌드하고, 둘 다 아니면 배포를 거부한다. 별도 ADR로 다룬다.

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
| **`GITHUB_TOKEN`을 Job별 최소 범위로** | **안 됨.** `permissions`가 워크플로 레벨 한 곳뿐이다 |
| CODEOWNERS와 필수 리뷰 | 안 됨. CODEOWNERS 파일이 없다 |
| 배포 이력을 서버 외부에 기록 | 안 됨(ADR-01과 같은 항목) |
| Runner 복구 Runbook | 안 됨 |
| 자원과 OOM 모니터링 | 안 됨. 컨테이너에 메모리 상한도 로그 로테이션도 없다 |

### 인프라 ADR-03 EC2 인스턴스 아키텍처

ARM64(Graviton)를 쓴다는 결정은 맞고 구현도 따라왔다. CI 러너를 `ubuntu-24.04-arm`으로 바꿨고 이미지도 arm64다.

**인스턴스 사양은 문서와 실물이 다르고, 문서 안에서도 값이 갈린다.**

| 위치 | 적힌 값 |
| --- | --- |
| 머리 속성 표의 ADR 번호 | `ADR-02` (데이터베이스 Select 값은 `ADR-03`) |
| 결정 요약 | t4g.small |
| 결정 첫 줄 | t4g.micro |
| 결정 둘째 줄 | 유형 t4g.small, 스토리지 gp3 20GB |
| **실물** | **t4g.micro 두 대, 디스크 각 8GB** |

「결정」의 첫 줄에 적힌 `ARM 아키텍처의 t4g.micro 인스턴스를 채택한다`가 실물과 맞는 줄이다.

### 인프라 ADR-04 모노레포 브랜치 전략

Superseded다. [인프라 ADR-05](adr-05-branch-strategy.md)가 대신한다.

### 인프라 ADR-05 분야별 트렁크와 출시 브랜치 전략

| 결정 항목 | 상태 |
| --- | --- |
| 브랜치 여섯 종류 | 됨 |
| main 진입 규칙 | 됨. `require-develop-for-main.yml`이 `be-release`와 `fe-release/*`만 허용한다 |
| CI는 PR만, CD는 머지 뒤 | 됨(2026-09-29). `backend-ci.yml`의 push 트리거를 뗐다 |
| `be-release` 승격 | 됨(2026-09-29). `Backend/scripts/resolve-source-commit.sh`가 판정한다. **아직 한 번도 돌지 않았다** |
| 머지 방식 강제 | 됨(2026-09-29). ruleset `Backend Release Protection`의 `allowed_merge_methods`가 `["merge"]`다 |
| `hotfix` 라벨 | 됨(2026-09-29) |
| `be-release` 필수 체크 | 됨(2026-09-29). `Backend Verification`과 `Require branches to be up to date` |
| `be-dev` 브랜치 보호 | 안 됨. 보호가 아예 없다 |

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

## 안 한 것

급한 순서다.

1. **컨테이너 자원 상한과 로그 로테이션이 없다.** t4g.micro 1GiB에 디스크 8GiB라 배포하면 OOM으로 죽거나 로그가 디스크를 채운다. `deploy.sh`의 `docker run`에 `--memory`와 `--log-opt`를 붙이면 된다.
2. **앞단이 없다.** 컨테이너가 `127.0.0.1`에 묶여 밖에서 닿지 않는다. nginx와 TLS를 올리거나 바인드 주소를 바꿔야 클라이언트가 QA를 할 수 있다. 안드로이드와 iOS가 평문 HTTP를 기본으로 막으므로 클라이언트 설정 확인이 먼저다.
3. **배포가 한 번도 돌지 않았다.** `backend-cd.yml`이 아직 `be-dev`에도 `be-release`에도 없어서 `Backend CD` 워크플로에 실행 이력이 없다. 그래서 아래 셋은 코드만 있고 실제로 동작하는지 모른다.
   - **롤백.** 첫 배포에는 되돌릴 이전 컨테이너가 없으므로 두 번째 배포부터 확인된다.
   - **`be-release` 승격.** 머지 커밋이 한 번 생겨야 판정이 돈다.
   - **이미지 정리.** 보존 대상이 셋 다 생긴 뒤에야 지울 것이 남는다.
4. **관측이 없다.** actuator가 liveness만 열고 metrics는 닫혀 있다. 로그 보존, 대시보드 지표, 실패 알림이 스프린트 1 조건인데 셋 다 없다.
5. **배포 Job에 `environment:`가 없다.** Production 승인 관문이 ADR-02의 결정인데 빠졌다.
6. **외부 Action이 태그로 고정되어 있다.** ADR-02는 commit SHA 고정을 요구한다.
7. **`permissions`가 대부분 워크플로 레벨이다.** publish 잡만 `contents: read`와 `pull-requests: read`로 좁혔다(2026-09-29). verify와 deploy 잡은 아직 워크플로 레벨을 따른다.
8. **배포 이력이 서버 외부에 없다.** `GITHUB_STEP_SUMMARY`까지다.
9. **env를 손으로 채웠다.** 서버가 날아가면 무슨 키가 있었는지 남지 않는다.
10. **MySQL이 없다.** 개발은 EC2 Docker MySQL, 운영은 RDS로 가기로 했고 둘 다 아직 만들지 않았다. 개발 서버 사양 결정이 먼저다.
11. **린터와 커버리지가 없다.** Gradle에 checkstyle도 spotless도 jacoco도 없다. IDEA checkstyle 설정만 있다.
12. **CODEOWNERS와 dependabot이 없다.**
13. **`backend-cd.yml`이 한 파일에 환경 둘을 담고 있다.** 307줄이고 `github.ref_name == 'be-release'` 삼항이 네 줄에 흩어져 있다(러너 라벨, concurrency group, 표시 이름, Spring 프로필). 환경이 늘면 네 줄을 다 고쳐야 하고 하나만 빠뜨리면 개발 브랜치가 운영 러너로 간다. `deploy.sh`의 프로필 대조가 그걸 잡으려고 있는 장치다. 아래 「나눌 때 참고」 참고.

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

**언제 할지.** **첫 배포가 성공한 뒤에 한다.** 지금 `backend-cd.yml`은 한 번도 돌지 않았다. 검증하지 않은 307줄을 셋으로 쪼개면 첫 배포가 실패했을 때 원인이 원래 로직인지 쪼개며 생긴 것인지 가리기 어렵다. 한 번 성공시켜 두면 쪼개기 전후로 개발 배포를 한 번씩 돌려 결과를 비교할 기준이 생긴다.

`github.ref_name`이 재사용 워크플로 안에서 호출한 쪽 ref를 가리키는지 확인해야 한다. `Backend/scripts/resolve-source-commit.sh`가 그 값으로 분기한다.

## 확인이 필요한 것

ADR을 고치거나 새로 쓰려면 이유를 알아야 하는데 어디에도 기록이 없다. 빈에게 물어서 채운다.

1. **왜 t4g.small이 아니라 t4g.micro로 만들었나.** 비용 때문이면 새 ADR로 남길 결정이고, 문서를 t4g.small로 적어 놓고 콘솔에서 micro를 고른 것이면 문서 오기다.
2. **디스크를 왜 8GB로 했나.** ADR-03은 gp3 20GB로 적었다. 생성 화면 기본값을 그대로 둔 것인지 확인한다.
3. **운영 서버에 스왑을 넣었나.** ADR-03은 선택지 C(`t4g.micro` + 스왑 2GB)를 "배포 중 강제 종료 위험" 때문에 채택하지 않았는데 실물이 t4g.micro다. 스왑이 없으면 그 위험을 그대로 안고 있다.
4. **개발 서버를 언제 왜 만들었나.** ADR-03은 운영 인스턴스 한 대만 다룬다. 개발 서버는 결정 기록이 없는 리소스다.
5. **개발은 Docker MySQL, 운영은 RDS로 가른 이유가 무엇인가.** 운영만 관리형으로 두어 백업과 시점 복원 부담을 더는 것이 맞는지 확인한다.

답이 모이면 **인프라 ADR-06 「서버 구성과 DB 배치」**를 써서 지금 실물을 결정으로 남기고, ADR-03의 사양 부분을 그 문서가 대신하게 한다. 개발 서버 사양(DB 인스턴스를 따로 띄울지, t4g.small로 키울지, 메모리 상한으로 버틸지)도 같이 담는다.
