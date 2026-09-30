# 인프라 현재 상태

지금 실제로 돌아가는 것과 ADR이 정했는데 아직 못 한 것을 적는다. **ADR은 결정 기록이라 함부로 고치지 않지만 이 문서는 바뀔 때마다 고친다.** 인프라를 건드리는 PR은 이 문서도 같이 고친다.

마지막 갱신 2026-09-29.

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
| **Build Once, Promote** | **됨(2026-09-29).** `resolve-source-commit.sh`가 승격을 판정한다. 아래 참고 |
| 배포 이력을 서버 외부에 기록 | 안 됨. `GITHUB_STEP_SUMMARY`까지다 |
| 동일 Git SHA 태그 재push 차단 | 부분. `Check Existing SHA Image`가 있으면 재사용하고 덮어쓰지는 않는다 |
| 레지스트리 보존 정책 | 안 됨 |
| DB 마이그레이션 호환성 정책 | 안 됨. 스키마는 dev에 손으로 적용한다 |

#### Build Once, Promote를 지키는 방법

**원래 문제는 이랬다.** `publish` 잡이 이미지 태그를 `${{ vars.DOCKERHUB_IMAGE }}:${{ github.sha }}`로 만들고 그 태그가 레지스트리에 있으면 재사용하는데, `be-dev`에서 `be-release`로 머지하면 **새 커밋 SHA가 생긴다.** 그래서 운영 배포 때 태그를 못 찾고 새로 빌드했다. 도커 빌드는 재현 가능하지 않으므로 digest가 달라지고, 개발에서 검증한 그 이미지가 운영에 가지 않는다.

**2026-09-29에 `Backend/scripts/resolve-source-commit.sh`로 해결했다.** `be-release`에 들어온 커밋의 두 번째 부모를 승격 대상으로 잡고, 그 커밋이 정말 `be-dev`의 조상인지 `git merge-base --is-ancestor`로 확인한 뒤 재빌드 없이 그 이미지를 배포한다. 조상 관계를 부모 수보다 **먼저** 보기 때문에, hotfix를 머지 커밋으로 넣어도 승격으로 새어 나가지 않는다. 결정은 [인프라 ADR-05](adr-05-branch-strategy.md)에 있고 판정표는 아래 「승격 판정」에 있다.

**아직 한 번도 돌지 않았다.** `be-release`에 머지 커밋이 한 번 생겨야 확인된다.

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
| 자원과 OOM 모니터링 | 부분(2026-09-29). 상한과 로그 로테이션은 코드에 넣었다(512m / 768m / 10m 3개). 모니터링은 없고 배포도 아직 안 돌았다 |

### 인프라 ADR-03 EC2 인스턴스 아키텍처

ARM64(Graviton)를 쓴다는 결정은 맞고 구현도 따라왔다. CI 러너를 `ubuntu-24.04-arm`으로 바꿨고 이미지도 arm64다.

**인스턴스 사양은 문서와 실물이 다르고, 문서 안에서도 값이 갈린다.**

| 위치 | 적힌 값 |
| --- | --- |
| 머리 속성 표의 ADR 번호 | `ADR-02` (데이터베이스 Select 값은 `ADR-03`) |
| 결정 요약 | t4g.small |
| 결정 첫 줄 | t4g.micro |
| 결정 둘째 줄 | 유형 t4g.small, 스토리지 gp3 20GB |
| **실물** | **t4g.micro 두 대, 디스크 각 8GB, 스왑 2GB** |

「결정」의 첫 줄에 적힌 `ARM 아키텍처의 t4g.micro 인스턴스를 채택한다`가 실물과 맞는 줄이다.

**ADR-03이 기각한 선택지 C가 실제로 돌고 있다.** 선택지 C는 `t4g.micro`에 스왑 2GB를 붙이는 안이었고, "배포 시점마다 응답이 느려진다"는 이유로 채택하지 않았다. 그런데 실물은 t4g.micro이고 양쪽 서버에 `/swapfile` 2GB가 붙어 있다. 910Mi밖에 없는 기계에서는 스왑이 안전망이므로 되돌릴 이유는 없고, 기록만 어긋나 있다.

**개발 서버 사양은 정해졌고 구축까지 끝났다(2026-09-29).** 세 후보 중 **DB 인스턴스를 따로 띄우는 안**으로 갔다. 앱 서버를 키우지 않고 `yeogidam-dev`는 앱만 돌리며, `yeogidam-dev-db`가 MySQL을 맡는다. 새 ADR로 남겨야 한다.

**개발 서버 앞단은 2026-09-30에 올렸다.** nginx 1.30이 호스트에 systemd 서비스로 돌고 443에서 Let's Encrypt 인증서(2026-12-29 만료)를 들고 `127.0.0.1:8080`으로 넘긴다. 80은 인증서 검증 경로만 열고 나머지는 443으로 보내며, 이름 없이 IP로 오는 요청은 거절하고 `/actuator`는 밖에서 404다. certbot은 dnf에 없어 `/opt/certbot` venv에 깔았고 `certbot-renew.timer`가 하루 두 번 확인해 갱신되면 nginx만 reload한다. 설정 원본은 `Infra/nginx/nginx.conf.template`이고 도메인은 `${SERVER_NAME}` 자리표라 저장소에 남지 않으며, 설치 절차는 `Infra/scripts/bootstrap-host.sh` 한 파일이라 서버가 늘면 그것만 다시 돌린다. 앱 쪽은 `application.yml`에 `server.forward-headers-strategy: native`를 더해 톰캣이 루프백에서 온 `X-Forwarded-*`만 믿게 했다. nginx를 컨테이너로 두지 않은 이유는 910Mi에서 컨테이너를 더 늘릴 여유가 없고 인증서 갱신이 앱과 분리되기 때문이다. 운영 서버에는 아직 안 올렸다.

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

## 안 한 것

급한 순서다.

1. **배포가 개발 서버에서 한 번만 돌았다.** 2026-09-30에 PR #226이 `be-dev`에 머지되어 `Backend CD`가 처음 돌았다. 이미지 push, digest 고정, 헬스 판정, 프로필 대조, 자원 상한(상한 512m과 스왑 몫 256MB와 로그 10m 3개가 컨테이너에 걸렸고 실사용 197MiB, 힙 256MB)은 서버에서 실측으로 확인했다. 카카오 로그인으로 `members`에 행이 생겨 앱이 DB에 쓰는 것까지 봤다. 첫 실행은 러너 서버에 `git`이 없어 「Validate Deployment Target」에서 멈췄고 `dnf install git` 뒤 재실행해서 통과했으며, 그래서 `bootstrap-host.sh`의 패키지에 `git`을 넣었다. 아래 셋은 아직 코드만 있다.
   - **롤백.** 지금 도는 것과 다른 이미지로 시작했다가 실패해야 돈다. 같은 이미지로 재실행하면 「이미 배포된 정상 이미지 유지」로 끝나 실패 자체가 안 난다. 헬스 대기를 1초로 줄이는 방법은 안 된다. 되돌린 옛 컨테이너를 확인할 때도 같은 값을 써서 복구까지 실패로 찍힌다. 대신 `BACKEND_MEMORY_LIMIT=64m`으로 새 컨테이너만 OOM으로 죽게 하고, 옛 컨테이너는 원래 상한 그대로 `docker start`되므로 정상 복구되는 것을 보는 방식으로 확인할 계획이다.
   - **`be-release` 승격과 운영 배포.** 운영 서버에 nginx가 아직 없고, 머지 커밋이 한 번 생겨야 판정이 돈다.
   - **이미지 정리.** `current`와 `previous` 밖의 이미지가 생기는 세 번째 배포 뒤에야 지울 것이 남는다.
2. **관측이 없다.** actuator가 liveness만 열고 metrics는 닫혀 있다. 로그 보존, 대시보드 지표, 실패 알림이 스프린트 1 조건인데 셋 다 없다.
3. **배포 Job에 `environment:`가 없다.** Production 승인 관문이 ADR-02의 결정인데 빠졌다. 환경별로 다른 변수를 주려면 이것이 먼저 있어야 한다. 지금은 저장소 변수 하나를 개발과 운영이 같이 쓴다.
4. **외부 Action이 태그로 고정되어 있다.** ADR-02는 commit SHA 고정을 요구한다.
5. **`permissions`가 대부분 워크플로 레벨이다.** publish 잡만 `contents: read`와 `pull-requests: read`로 좁혔다(2026-09-29). verify와 deploy 잡은 아직 워크플로 레벨을 따른다.
6. **배포 이력이 서버 외부에 없다.** `GITHUB_STEP_SUMMARY`까지다.
7. **env를 손으로 채웠다.** 서버가 날아가면 무슨 키가 있었는지 남지 않는다. 비비디는 env 전문을 깃허브 시크릿에 넣고 배포 때 서버에 떨어뜨린다.
8. **운영 DB가 없다.** 개발 DB는 2026-09-29에 `yeogidam-dev-db`에 Docker MySQL로 띄웠고 스키마까지 넣었다. 운영은 RDS로 가기로 했는데 아직 만들지 않았다. 마이그레이션 도구가 없어 스키마 변경을 개발과 운영 양쪽에 손으로 적용해야 하는 것도 그대로다.
9. **운영 디스크가 빠듯하다.** 2026-09-29에 러너 옛 버전 448MB를 지워 여유가 2.3G에서 2.7G로 늘었다. 그래도 8GB 중 2GB를 `/swapfile`이 가져가 실제로 쓸 수 있는 것은 6GB다. `current`와 `previous`와 `candidate` 세 이미지를 보존하려면 1GB 가까이 필요하다. journal은 상한이 없어 운영 256MB, 개발 185MB까지 자랐다. `ec2-user`의 `~/.warp` 196MB도 지울 수 있는데 아직 안 지웠다.
10. **린터와 커버리지가 없다.** Gradle에 checkstyle도 spotless도 jacoco도 없다. IDEA checkstyle 설정만 있다. CI가 `./gradlew build`라 `check`까지 도므로, 붙이기만 하면 PR 단계에서 걸린다.
11. **CODEOWNERS와 dependabot이 없다.**
12. **`project-public`에 8080이 `0.0.0.0/0`으로 열려 있다.** 공용 보안 그룹이라 우리가 닫을 수 없다. 2026-09-30에 `deploy.sh`의 바인딩 주소를 `127.0.0.1` 상수로 박고 `backend-cd.yml`에서 `BACKEND_BIND_ADDRESS` 변수를 지웠다. 그 전에는 repository variable 하나로 앱이 TLS 없이 인터넷에 노출될 수 있었는데, 이제 앱은 언제나 로컬에만 귀를 열고 밖으로 가는 길은 nginx 443뿐이다. 8080이 열려 있다는 사실은 그대로라서, 서버에서 다른 프로세스가 8080을 `0.0.0.0`으로 열면 여전히 노출된다.
13. **`backend-cd.yml`이 한 파일에 환경 둘을 담고 있다.** 307줄이고 `github.ref_name == 'be-release'` 삼항이 네 줄에 흩어져 있다(러너 라벨, concurrency group, 표시 이름, Spring 프로필). 환경이 늘면 네 줄을 다 고쳐야 하고 하나만 빠뜨리면 개발 브랜치가 운영 러너로 간다. `deploy.sh`의 프로필 대조가 그걸 잡으려고 있는 장치다. 아래 「나눌 때 참고」 참고.
14. **nginx 설정의 도메인이 어디에도 관리되지 않는다.** `bootstrap-host.sh`는 사람이 서버에서 `SERVER_NAME`을 명령줄에 쳐서 돌리고, 값은 렌더된 `/etc/nginx/nginx.conf`와 `/etc/letsencrypt/live/<도메인>/`에만 남는다. 서버가 날아가면 값을 알아야 하고 재실행 때마다 다시 쳐야 한다. 도메인은 DNS로 누구나 조회할 수 있어 비밀이 아니고, 저장소에 안 적는 이유는 우테코 공개 저장소 규칙이므로 팀 노션에는 적어도 된다. 최종 모습은 깃허브 Environments(`development`, `production`)에 `BACKEND_DOMAIN`을 두고, deploy 잡이 브랜치에 따라 환경을 골라 템플릿을 렌더해 서버에 반영하고 nginx를 reload하는 것이며, 3번(`environment:` 도입)과 같은 작업이다. 다만 스크립트는 사람이 sudo로 돌리는 것이라 깃허브 변수를 읽을 수 없고, CD가 nginx 설정을 쓰고 reload하려면 러너에 sudo가 필요하다. 비비디는 러너에 `NOPASSWD: ALL`을 줬는데 그러면 `be-release`에 머지할 수 있는 사람이 서버 root를 갖는 것이라 그렇게 하지 않는다. 두 단계로 간다.
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

**언제 할지.** **첫 배포가 성공한 뒤에 한다.** 지금 `backend-cd.yml`은 한 번도 돌지 않았다. 검증하지 않은 307줄을 셋으로 쪼개면 첫 배포가 실패했을 때 원인이 원래 로직인지 쪼개며 생긴 것인지 가리기 어렵다. 한 번 성공시켜 두면 쪼개기 전후로 개발 배포를 한 번씩 돌려 결과를 비교할 기준이 생긴다.

`github.ref_name`이 재사용 워크플로 안에서 호출한 쪽 ref를 가리키는지 확인해야 한다. `Backend/scripts/resolve-source-commit.sh`가 그 값으로 분기한다.

## 확인이 필요한 것

ADR을 고치거나 새로 쓰려면 이유를 알아야 하는데 어디에도 기록이 없다. 빈에게 물어서 채운다.

1. **왜 t4g.small이 아니라 t4g.micro로 만들었나.** 비용 때문이면 새 ADR로 남길 결정이고, 문서를 t4g.small로 적어 놓고 콘솔에서 micro를 고른 것이면 문서 오기다.
2. **디스크를 왜 8GB로 했나.** ADR-03은 gp3 20GB로 적었다. 생성 화면 기본값을 그대로 둔 것인지 확인한다. 지금 운영이 72% 찬 상태라 이미지 세 개를 보존하기에 빠듯하다.
3. **개발 서버를 언제 왜 만들었나.** ADR-03은 운영 인스턴스 한 대만 다룬다. 개발 서버는 결정 기록이 없는 리소스다.
4. **개발은 Docker MySQL, 운영은 RDS로 가른 이유가 무엇인가.** 운영만 관리형으로 두어 백업과 시점 복원 부담을 더는 것이 맞는지 확인한다.
5. **운영의 `/home`이 개발보다 1.25GB 큰 이유 중 절반이 아직 안 밝혀졌다.** 2026-09-29에 러너 옛 버전 디렉터리 448MB를 찾아 지웠고, `ec2-user`의 `~/.warp`가 196MB를 쓰는 것도 확인했지만 아직 안 지웠다. 둘을 합쳐 644MB라 나머지 600MB 남짓이 어디에 있는지 모른다. `sudo du -h --max-depth=2 /home | sort -rh | head -20`으로 끝내면 된다.

### 답이 나온 것

- **스왑.** 양쪽 서버에 `/swapfile` 2GB가 붙어 있고 swappiness는 60이다(2026-09-29 실측). ADR-03이 기각한 선택지 C가 그대로 돌고 있다.
- **개발 서버 사양.** DB 인스턴스를 따로 띄우기로 했고 `yeogidam-dev-db`를 만들었다(2026-09-29). `yeogidam-dev`는 앱만 돌린다.

답이 모이면 **인프라 ADR-06 「서버 구성과 DB 배치」**를 써서 지금 실물을 결정으로 남기고, ADR-03의 사양 부분을 그 문서가 대신하게 한다. 개발용 DB를 별도 인스턴스에 두는 결정과 스왑을 쓰는 상태도 같이 담는다.
