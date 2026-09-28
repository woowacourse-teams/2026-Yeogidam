# 인프라 ADR-01. Docker 이미지 식별 및 롤백 보존 전략

| | |
| --- | --- |
| Status | Accepted (2026-09-28) |
| Area | Infrastructure |
| Category | Docker, CI/CD, Rollback |
| Date | 2026-08-25 |

## 구현 현황 (2026-09-28)

`\.github/workflows/backend-cd.yml`과 `Backend/scripts/deploy.sh` 기준이다. 결정은 그대로 두고 구현 상태만 적는다.

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

### Build Once, Promote를 못 지키는 이유

`publish` 잡이 이미지 태그를 `${{ vars.DOCKERHUB_IMAGE }}:${{ github.sha }}`로 만들고, 그 태그가 레지스트리에 이미 있으면 재사용한다. 그런데 `be-dev`에서 `be-release`로 머지하면 머지 커밋이든 squash든 rebase든 **새 커밋 SHA가 생긴다.** 그래서 운영 배포 때 태그를 찾지 못하고 새로 빌드한다. 도커 빌드는 재현 가능하지 않으므로 digest가 달라지고, 개발에서 검증한 그 이미지가 운영에 가지 않는다. 이 문서가 막으려던 상황이 그대로 일어난다.

고치는 방향은 승격 판정을 넣는 것이다. `be-release`에 들어온 커밋이 부모 두 개인 머지 커밋이면 두 번째 부모를 승격 대상으로 잡고, 그 커밋이 정말 `be-dev`의 조상인지 `git merge-base --is-ancestor`로 확인한 뒤 재빌드 없이 그 이미지를 배포한다. 부모가 하나이면 hotfix 경로인지 확인한 뒤에만 새로 빌드하고, 둘 다 아니면 배포를 거부한다. 별도 ADR로 다룬다.

## 결정 요약

애플리케이션의 소스 버전은 Git Commit SHA로 추적하고, 실제 배포 산출물은 Docker image digest로 식별한다.

CI에서 이미지를 한 번만 빌드한 뒤 개발, 스테이징, 운영 환경에서 동일한 digest를 승격하여 사용한다. Git Commit SHA 태그는 추적 목적으로 함께 사용하지만 덮어쓰지 않는다.

운영 서버에는 애플리케이션별로 현재 정상 이미지와 직전 정상 이미지를 보존하고, 그보다 오래된 릴리스 이미지는 레지스트리의 보존 정책 또는 CI의 보존 자동화로 관리한다.

## 맥락과 문제

Git Commit SHA는 소스 코드의 특정 상태를 식별할 뿐, Docker 이미지까지 유일하게 식별하지는 못한다. 동일한 Commit을 다시 빌드하더라도 Base Image, 외부 패키지, 빌드 도구, CPU 아키텍처 또는 이미지 메타데이터가 달라지면 서로 다른 Docker digest가 만들어질 수 있기 때문이다.

즉 Git SHA만으로는 운영 환경에서 실행한 이미지의 byte identity를 확정하기 어렵고, 태그는 덮어쓸 수 있는 이름표라서 동일한 Git SHA 태그가 다른 이미지로 바뀌면 장애가 발생했을 때 실제 배포 산출물을 역추적하기도 어렵다.

한편, 배포마다 고유한 SHA 태그를 붙인 이미지를 운영 서버에 무기한 남기면 디스크 사용량이 계속 증가한다. 반대로 사용하지 않는 이미지를 일괄 삭제하면 직전 정상 이미지까지 제거되어 빠른 롤백이 어려워질 수 있다.

우리는 다음 문제를 함께 해결해야 한다.

- 개발, 스테이징, 운영에서 동일한 산출물을 실행해야 한다.
- 실행 중인 이미지를 소스 코드와 연결해 추적할 수 있어야 한다.
- 장애 발생 시 직전 정상 버전으로 빠르게 돌아갈 수 있어야 한다.
- 운영 서버의 디스크 사용량이 배포 횟수에 비례해 무한히 증가해서는 안 된다.
- 이미지 롤백과 설정과 DB 호환성을 함께 관리해야 한다.

## 결정 기준

1. 배포 산출물의 불변성과 추적 가능성
2. 스테이징에서 검증한 산출물과 운영 산출물의 동일성
3. 장애 발생 시 빠르고 예측 가능한 롤백
4. 운영 서버의 CPU, 메모리, 디스크 사용량 제어
5. 레지스트리 또는 네트워크 장애 시의 복구 가능성
6. 운영 복잡성과 유지보수 비용

## 검토한 선택지

### 선택지 A: latest 또는 환경 태그만 사용

```
team-api:latest
team-api:dev
team-api:prod
```

**장점.** 배포 설정이 단순해서 사람이 이해하기 쉽다.

**단점.** 태그가 새로운 이미지로 계속 이동하기 때문에, 특정 시점에 어떤 이미지가 실행됐는지 확정하기 어렵고 정확한 롤백 대상 식별도 어렵다.

**장애 상황 예시.** 월요일에 이미지 X를 `team-api:prod` 태그로 push해 배포했고, 수요일에 다음 릴리스인 이미지 Y를 같은 태그로 push해 배포했다. 수요일 저녁에 장애가 발생했다.

```
월요일   team-api:prod → 이미지 X 배포
수요일   team-api:prod → 이미지 Y 배포 (태그가 X에서 Y로 이동)
수요일 저녁 장애 발생
```

복구를 위해 직전 버전으로 롤백하려 해도, `prod` 태그는 이미 Y를 가리키고 있고 X를 부를 이름은 남아 있지 않아서 돌아갈 대상을 지정할 수 없다. 디버깅을 위해 정상이던 월요일 상태를 재현해 Y와 비교하려 해도, 그 시점에 무엇이 돌고 있었는지 기록할 식별자가 없어서 재현 환경을 만들 수 없다. 두 작업 모두 이미지를 시점으로 특정할 식별자가 없어서 막힌다.

**결론: 채택하지 않는다.**

### 선택지 B: Git Commit SHA 태그만 사용

```
team-api:a1b2c3d
```

**장점.** 이미지에서 소스 Commit을 쉽게 역추적할 수 있고, 릴리스별 태그를 구분할 수 있다. 배포 이력을 관리할 수 있고, 두 릴리스를 나란히 놓고 비교할 수도 있다.

**단점.** 문제가 두 층에서 남는다.

첫째, 이름과 이미지의 연결이 바뀔 수 있다. 커밋 SHA를 태그에 담아도 태그는 여전히 옮길 수 있는 포인터라서, 레지스트리는 기본 설정에서 같은 태그의 재push를 거부하지 않고 가리키는 대상을 새 이미지로 바꾼다. push라는 행위가 원인이므로 레지스트리의 tag immutability 기능이나 CI 검증으로 막을 수 있다.

둘째, 커밋과 이미지의 대응이 일대일이 아니다. Docker 빌드는 재현 가능하게 설계되어 있지 않아서, base와 소스가 그대로여도 이미지 설정의 created 시각, 레이어 속 파일의 수정 시각, 애플리케이션 빌드 산출물의 내부 타임스탬프가 빌드 시점을 따라가기 때문에, 동일 Commit을 재빌드하면 서로 다른 digest가 만들어질 수 있다. 기본 설정에서는 같은 digest가 보장되지 않고, 완전한 재현 빌드에는 BuildKit의 재현 빌드 옵션(빌드 시각 고정 등)과 입력 고정 같은 추가 구성이 필요하다.

앞의 문제를 tag immutability로 막아 태그 하나에 이미지 하나를 고정하더라도 뒤의 문제가 남는다. 커밋 SHA를 아는 것이 이미지 내용을 아는 것과 같아지지 않으므로, Git SHA 태그는 실제 이미지 내용의 불변 식별자가 아니다.

**결론: 배포 산출물의 유일한 식별자가 아니라 추적용 보조 식별자로 사용한다.**

### 선택지 C: 환경마다 동일 Git Commit을 재빌드

```
개발 환경용 빌드
스테이징 환경용 재빌드
운영 환경용 재빌드
```

**장점.** 환경별 Dockerfile과 빌드 설정을 적용하기 쉽다. 개발용 이미지에는 디버그 도구와 상세 로그 설정을 넣고, 운영용 이미지는 멀티 스테이지 빌드로 최적화한 경량 구성으로 만든다. 환경별 설정 파일을 빌드 시점에 이미지에 넣고 프로필까지 고정하면, 컨테이너를 띄울 때 환경변수나 외부 설정을 주입하는 장치를 따로 만들 필요가 없다. 즉 환경별 값을 런타임 설정으로 분리할 필요가 없다.

```
Dockerfile.dev  → 디버그 도구, 상세 로그, application-dev.yml 포함
Dockerfile.prod → 멀티 스테이지 최적화, application-prod.yml 포함
```

**단점.** 같은 Git Commit에서도 환경별 digest가 달라질 수 있어서, 스테이징에서 검증한 이미지와 운영에서 실행한 이미지가 달라진다. 장애 원인과 릴리스 산출물 추적이 어려워진다.

**결론: 채택하지 않는다.**

### 선택지 D: 한 번 빌드하고 digest를 환경 간 promote

```
Git Commit
    ↓
CI에서 한 번 빌드
    ↓
Docker Registry에 push
    ↓
Digest 기록
    ├─ 개발 배포
    ├─ 스테이징 배포
    └─ 운영 배포
```

**장점.** 모든 환경이 동일한 이미지를 사용하므로, 실행 이미지의 정확한 내용을 식별할 수 있고 장애 분석과 롤백 대상 선택이 명확하다. 운영 서버에서 빌드하지 않아 빌드 부하를 분리할 수 있다.

**단점.** digest 수집과 릴리스 메타데이터 관리가 필요하다. 환경별 값은 이미지가 아니라 런타임 설정으로 분리해야 한다. 레지스트리 보존 정책이 필요하다.

**결론: 채택한다.**

## 결정

### Build Once, Promote

하나의 Git Commit에 대해 CI에서 Docker 이미지를 한 번만 빌드하고, 개발, 스테이징, 운영에서 동일 Commit을 다시 빌드하지 않는다.

```
Git Commit a1b2c3d
        ↓
CI 빌드 및 테스트
        ↓
team-api:a1b2c3d push
        ↓
team-api@sha256:IMAGE-A 기록
        ├─ 개발
        ├─ 스테이징
        └─ 운영
```

### Git SHA 태그와 Docker digest를 함께 기록

Git SHA 태그는 소스 추적을 위해 사용하고, 실제 배포는 digest로 고정한다.

```
소스 식별자: a1b2c3d
추적용 태그: team-api:a1b2c3d
배포 식별자: team-api@sha256:IMAGE-A
```

동일 Git SHA 태그의 재push는 금지한다. tag immutability를 지원하는 레지스트리(ECR)에서는 그 기능으로 강제하고, 미지원 레지스트리(GHCR, Docker Hub)에서는 push 전에 태그 존재를 확인하는 CI 검증으로 강제한다.

### 배포 이력을 운영 서버 외부에 기록

각 릴리스에 다음 정보를 기록한다.

```json
{
  "release": "release-2026-08-24-001",
  "gitSha": "a1b2c3d",
  "imageTag": "team-api:a1b2c3d",
  "imageDigest": "team-api@sha256:IMAGE-A",
  "architecture": "linux/arm64",
  "configVersion": "config-15",
  "dbMigrationVersion": "V20260824_01",
  "previousRelease": "release-2026-08-20-003",
  "status": "healthy"
}
```

실제 Secret 값은 기록하지 않고, 설정이나 Secret의 version identifier만 기록한다. 배포 이력은 운영 서버가 장애를 일으켜도 조회할 수 있도록 GitHub Releases 등 서버 외부에 보관한다.

### 운영 서버의 로컬 이미지 보존

단일 애플리케이션 기준으로 현재 정상 이미지와 직전 정상 이미지를 로컬에 유지한다.

digest로 pull한 이미지는 로컬에서 태그가 없는 상태로 남으므로, pull 직후 두 종류의 로컬 태그를 붙인다. Git SHA 태그는 이미지의 정체를 추적하고, 역할 태그(`current`, `previous`, `candidate`)는 현재 상태를 가리킨다. 배포가 성공하면 역할 태그만 옮긴다.

```bash
docker pull team-api@sha256:IMAGE-B
docker tag team-api@sha256:IMAGE-B team-api:b2c4d8e     # 정체 태그
docker tag team-api@sha256:IMAGE-B team-api:candidate   # 역할 태그
# 배포 성공 판정 후
docker tag team-api:current   team-api:previous
docker tag team-api:candidate team-api:current
```

역할 태그는 서버 외부의 배포 이력을 조회할 수 없는 상황에서도 직전 정상 이미지를 로컬에서 식별하는 수단이 된다.

배포 전

```
현재: IMAGE-A
직전: IMAGE-Z
```

신규 후보 다운로드 후

```
후보: IMAGE-B
현재: IMAGE-A
직전: IMAGE-Z
```

신규 배포 성공 후

```
현재: IMAGE-B
직전: IMAGE-A
삭제 가능: IMAGE-Z
```

신규 배포 실패 후

```
실패 후보: IMAGE-B
현재로 복구: IMAGE-A
직전: IMAGE-Z
```

배포 중에는 후보 이미지를 포함해 일시적으로 세 개 이상이 존재할 수 있다. 로컬 보존 개수는 애플리케이션별 기준이며 서버 전체의 이미지 개수를 의미하지 않는다.

### 레지스트리 보존

운영 서버의 로컬 이미지는 빠른 롤백을 위한 캐시로 취급하고, 롤백 이미지의 원본은 Docker Hub, ECR 또는 GHCR 같은 이미지 레지스트리에 둔다.

정상 릴리스의 초기 보존 정책은 다음 중 하나로 시작하고 실제 배포 빈도와 저장 비용을 바탕으로 조정한다.

- 최근 10개 정상 릴리스 보존
- 최근 30일 정상 릴리스 보존

실패 이미지는 위 선택과 무관하게 장애 분석 기간 동안 별도 보존한다.

보존 정책의 실행은 내장 기능이 있는 레지스트리(ECR lifecycle policy)에서는 그 기능으로, 없는 레지스트리(GHCR, Docker Hub)에서는 CI의 정기 실행 작업으로 구현한다.

### 이미지 정리

서버 전체를 대상으로 다음 명령을 무조건 실행하지 않는다.

```bash
# 존재하는 컨테이너가 쓰지 않는 이미지를 전부 강제로 지운다.
docker image prune -a -f
# 멈춘 컨테이너, 미사용 네트워크, 빌드 캐시까지 전부 강제로 지운다.
docker system prune -a -f
```

`-a`가 없는 `docker image prune`도 안전하지 않다. digest로만 pull해 태그가 없는 이미지는 dangling으로 분류되어 함께 삭제되기 때문이다. 「운영 서버의 로컬 이미지 보존」절의 태그 규칙을 지키면 보존 대상 이미지는 dangling에서 벗어난다.

삭제 전, 절대 지우면 안 되는 digest 목록(삭제 금지 목록)을 먼저 만든다. 세 항목 모두 역할 태그가 가리키는 digest로 계산할 수 있다.

```
현재 실행 중인 digest
직전 정상 digest
배포 중인 후보 digest
```

실패 이미지의 장애 분석은 레지스트리에 보존된 원본으로 수행하므로, 로컬에서는 따로 보호하지 않는다.

## 트레이드오프

### 장점

- 개발, 스테이징, 운영에서 동일한 이미지가 실행된다.
- Git SHA 재빌드로 인한 산출물 혼동을 방지한다.
- 운영 중인 이미지의 정확한 digest를 확인할 수 있다.
- 직전 정상 이미지가 로컬에 있어 빠르게 롤백할 수 있다.
- 장기 롤백 이미지는 레지스트리에서 관리할 수 있다.
- 운영 서버의 디스크 사용량을 예측 가능하게 제어할 수 있다.
- 장애 발생 시 Git Commit, 이미지, 설정, DB 버전을 함께 추적할 수 있다.

### 단점

- CI에서 digest를 수집하고 전달하는 구현이 필요하다.
- 릴리스 메타데이터 저장소가 필요하다.
- 이미지 레지스트리의 보존 및 삭제 정책을 운영해야 한다.
- 프로젝트별 로컬 이미지 정리 로직이 필요하다.
- DB와 설정 호환성을 고려하지 않으면 이미지 롤백만으로 복구할 수 없다.
- digest는 이미지 제작자와 안전성을 증명하지 않으므로 필요하면 이미지 서명과 provenance를 추가해야 한다.

## 후속 결정

- Base Image digest와 애플리케이션 의존성 lockfile을 별도로 관리해야 한다.
- 멀티 아키텍처 이미지를 사용할 경우 image index digest와 플랫폼별 manifest digest의 기록 방식을 정해야 한다.
- 이미지 서명, SBOM 및 취약점 스캔 도입은 별도 결정으로 다룬다.

## 구현 체크리스트

- [ ] 사용할 이미지 레지스트리를 결정한다. 판단 기준에 보존 정책과 tag immutability의 지원 여부를 포함한다. 내장 지원은 ECR뿐이며, 현재 계정은 ECR 권한이 없음을 확인했다(2026-08-25).
- [ ] Git SHA 태그의 덮어쓰기를 차단한다.
- [ ] CI에서 이미지를 한 번만 빌드하고 push한다.
- [ ] 빌드 결과의 Docker digest를 수집한다.
- [ ] Git SHA와 digest를 릴리스 이력에 기록한다.
- [ ] 개발, 스테이징, 운영에서 동일 digest를 사용한다.
- [ ] Compose 또는 배포 스크립트가 `repository@sha256:...` 형식을 받도록 한다.
- [ ] 현재 및 직전 정상 릴리스를 운영 서버 외부에 기록한다.
- [ ] 배포 전 후보 이미지를 pull하고, Git SHA 태그와 역할 태그(`candidate`)를 로컬에 붙인다.
- [ ] 헬스체크 실패 시 직전 digest와 설정으로 롤백한다.
- [ ] 성공 시 역할 태그를 옮겨 신규 이미지를 현재로, 기존 이미지를 직전으로 전환한다.
- [ ] 애플리케이션별 로컬 이미지 정리 정책을 구현한다.
- [ ] 레지스트리 보존 정책을 적용한다. 내장 기능이 없는 레지스트리에서는 CI 정기 작업으로 구현한다.
- [ ] DB 마이그레이션 호환성 정책을 정의한다.

## 검증 기준

- 동일 릴리스가 환경마다 재빌드되지 않는다.
- 스테이징과 운영이 동일 Docker digest를 사용한다.
- 실행 중인 컨테이너의 repository digest를 조회할 수 있다.
- Git SHA에서 Docker digest를 역추적할 수 있다.
- Docker digest에서 Git SHA를 역추적할 수 있다.
- 직전 정상 릴리스가 서버 외부의 배포 이력에 기록된다.
- 직전 정상 이미지가 운영 서버 로컬에 보존된다.
- 레지스트리 장애 상황에서도 직전 버전으로 롤백할 수 있다.
- 이미지 정리 과정에서 현재, 직전, 후보 이미지는 삭제되지 않는다.
- 정의된 호환 기간 동안 이전 애플리케이션과 DB 스키마가 함께 동작한다.
- 동일 Git SHA 태그의 재push가 거부된다.
- 서버 외부의 배포 이력을 조회할 수 없어도 로컬 역할 태그로 직전 정상 이미지를 식별할 수 있다.

## 롤백

1. 현재 실패한 릴리스를 배포 이력에서 failed로 표시한다.
2. `previousRelease`의 image digest와 설정 버전을 조회한다.
3. 직전 정상 이미지를 로컬에서 실행한다. 배포 이력을 조회할 수 없으면 로컬 역할 태그(`previous`)로 식별하고, 로컬에 없다면 레지스트리에서 동일 digest를 pull한다.
4. 직전 설정 버전을 복구한다.
5. 애플리케이션 헬스체크와 핵심 기능 검증을 수행한다.
6. DB 스키마가 이전 애플리케이션과 호환되는지 확인한다.

DB 변경은 이전 버전과 신규 버전이 일정 기간 함께 동작할 수 있도록 Expand/Contract 방식으로 수행한다.

## 재검토 조건

다음 상황이 발생하면 본 문서의 결정을 다시 검토한다.

- 이미지 레지스트리 또는 네트워크 가용성이 롤백 목표를 충족하지 못한다.
- 이미지 저장 비용이나 운영 서버 디스크 사용량이 예상 임계치를 초과한다.
- 멀티 리전, 멀티 아키텍처 또는 Blue/Green 배포가 필요해진다.
- 선택한 레지스트리나 인프라 제공자의 권한과 정책이 변경된다. 현재 막혀 있는 ECR 권한이 열리는 경우도 여기에 해당하며, 그때 레지스트리 선택을 다시 검토한다.
- 이미지 서명 또는 공급망 보안 요구사항이 추가된다.
- DB 롤백 요구사항이 현재 Expand/Contract 정책으로 충족되지 않는다.

결정을 변경할 때는 기존 ADR을 덮어쓰지 않고, 새로운 ADR을 작성한 뒤 본 문서의 상태를 Superseded로 변경한다.

## Reference

- Docker 공식 문서, `docker image prune`
- Docker 공식 문서, `docker system prune`
- Docker 공식 문서, 디스크 사용량 확인(`docker system df`)
- Docker 공식 문서, Image digests
- Docker 공식 문서, digest로 pull
- Docker 공식 문서, Compose의 image 형식
- Docker 공식 문서, Build attestations(provenance)
- OCI image-spec, Descriptor(digest 정의)
- OCI image-spec, Image Index(멀티 아키텍처 digest)
- AWS 공식 문서, ECR image tag mutability
- AWS 공식 문서, ECR lifecycle policies
- BuildKit 공식 문서, Reproducible builds
- sigstore/cosign, 이미지 서명 도구
- Martin Fowler, Parallel Change(Expand/Contract)
- Red Hat, Build once, deploy anywhere

## 옮긴 기록

- 2026-09-28. 팀 노션 ADR 데이터베이스에서 이 저장소로 옮겼다. 하위 페이지 「Docker tag, digest, dangling image 이해하기」는 함께 옮기지 않았다.
