# 인프라 ADR-02. CI/CD 실행 전략

| | |
| --- | --- |
| Status | Accepted (2026-09-28) |
| Area | Infrastructure |
| Category | Rollback, CI/CD, Docker |
| Date | 2026-08-25 |

문서 안의 `ADR-001`은 [인프라 ADR-01](adr-01-docker-image-identity.md)을 가리킨다. 노션에 있던 표기를 그대로 두었다.

## 구현 현황 (2026-09-28)

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

문서가 정한 것 중 안 된 세 가지(승인 관문, commit SHA 고정, 잡별 권한)는 워크플로만 고치면 되는 작은 변경이다. 자원 상한은 t4g.micro 1GiB에 디스크 8GiB라 먼저 넣어야 한다.

## 결정 요약

우리는 운영 EC2에 빌드 부하를 주지 않고 승인된 릴리스만 안전하게 배포하기 위해, CI는 GitHub-hosted Runner에서 수행하고 CD는 운영 EC2의 배포 전용 Self-hosted Runner에서 수행하는 방식을 채택한다.

## 맥락과 문제

테스트와 릴리스 생성 작업을 어디에서 실행하고, 승인된 릴리스를 어떤 경로와 권한으로 운영 EC2에 전달할지 결정해야 한다. CI 실패가 운영 배포로 이어지지 않아야 하고, 배포 작업은 승인, 실행자, 대상 릴리스와 결과를 추적할 수 있어야 한다.

초기 운영 대상은 자원이 작은 단일 ARM64 EC2 인스턴스(t4g.micro)다. 운영 애플리케이션과 Gradle 테스트 및 빌드가 같은 CPU, 메모리, 디스크를 경쟁하면 서비스 장애로 이어질 수 있다. 따라서 운영 EC2에는 배포에 필요한 최소 작업만 남겨야 한다.

GitHub Actions를 위해 EC2에 새 인바운드 포트를 열지 않는 것을 전제로 한다. CodeDeploy와 SSM은 배포 실행 방식으로 사용할 수 있지만, 필요한 AWS IAM Role, Instance Profile과 조직 정책을 현재 확인된 권한과 일정 안에서 구성할 수 있는지 검증되지 않았다. 운영 Workflow를 구현하기 전에 실행 위치, 신뢰 경계와 장애 복구 절차를 먼저 확정해야 한다.

## 결정 기준

이번 결정을 다음 기준의 중요도 순서로 평가한다.

1. 신뢰하지 않는 코드가 운영 EC2에서 실행되지 않아야 하며, 테스트와 빌드 부하도 운영 EC2와 분리되어야 한다.
2. 새 인바운드 포트 없이 현재 확인된 네트워크와 IAM 권한 안에서 구현할 수 있어야 한다.
3. 배포 실패를 명확히 판정하고 직전 정상 릴리스로 롤백할 수 있어야 한다.
4. 단일 EC2에서 관리할 구성 요소를 최소화한다.

## 검토한 선택지

### 선택지 A: GitHub-hosted CI + 운영 EC2의 배포 전용 Self-hosted Runner

**설명.** PR 검증과 기본 Branch의 릴리스 생성은 GitHub-hosted Runner에서 수행한다. 운영 배포가 승인되면 EC2에 설치된 Self-hosted Runner가 GitHub에서 배포 Job을 받는다. GitHub는 Runner에 release ID와 배포 명령을 전달하고, Runner는 Registry에서 해당 릴리스를 가져와 애플리케이션을 교체한다. 운영 Runner는 컴파일이나 테스트를 하지 않는다. 릴리스 검증, 배포, 헬스 체크와 ADR-001의 롤백 호출만 수행한다.

**장점**

- PR 테스트와 빌드를 GitHub-hosted Runner에서 수행하므로 운영 EC2에 빌드 부하가 발생하지 않는다.
- EC2 Runner가 GitHub에 아웃바운드 HTTPS로 연결하므로 GitHub용 인바운드 포트가 필요 없다.
- GitHub의 CI 결과, Environment 승인, 실행자와 Job 로그를 한 흐름에서 추적할 수 있다.
- CodeDeploy나 SSM을 위한 AWS IAM Role과 추가 배포 리소스 없이 시작할 수 있다.
- 현재 단일 EC2에 필요한 배포 동작만 구현하므로 도입 범위가 작다.

**단점**

- 운영 서버에 GitHub Actions Runner 프로세스가 상시 실행된다.
- GitHub 제어 영역에 장애가 있거나 Runner 연결이 끊기면 새 배포를 실행할 수 없다.
- Runner 업데이트, 재등록, 토큰 폐기와 장애 복구를 팀이 운영해야 한다.
- 단일 EC2의 컨테이너 교체 방식이므로 이 결정만으로 무중단 배포가 보장되지는 않는다.

### 선택지 B: AWS CodeDeploy

**설명.** GitHub-hosted Runner가 CI와 릴리스 생성을 마친 뒤 CodeDeploy Deployment에 배포를 요청한다. CodeDeploy는 배포 대상 EC2와 실행 순서를 관리하고, EC2에 설치된 CodeDeploy Agent는 AppSpec에 정의된 배포 스크립트를 실행한다.

**장점**

- 테스트와 빌드를 GitHub-hosted Runner에서 수행하므로 운영 EC2에 빌드 부하와 PR 코드가 도달하지 않는다.
- 운영 EC2에 GitHub Self-hosted Runner와 Runner 토큰을 둘 필요가 없다.
- 배포 대상, 단계별 실행 결과와 성공, 실패 이력을 AWS에서 확인할 수 있다.
- 여러 인스턴스, Auto Scaling Group과 Load Balancer가 도입되면 순차 또는 Blue/Green 배포로 확장하기 좋다.

**단점**

- EC2에 CodeDeploy Agent를 설치하고 업데이트해야 한다.
- CodeDeploy Service Role, EC2 Instance Profile, Deployment Group과 AppSpec을 추가로 구성해야 한다.
- GitHub Actions가 CodeDeploy 배포를 요청할 수 있도록 OIDC 또는 AWS 자격 증명과 IAM 권한을 구성해야 한다.
- 현재 단일 EC2에서는 배포 이력 관리의 이점보다 IAM, Agent, AWS 리소스를 관리하는 부담이 더 클 수 있다.

### 선택지 C: 운영 EC2의 Self-hosted Runner가 CI와 CD를 모두 수행

**설명.** 운영 EC2에 GitHub Actions Runner와 빌드 도구를 설치하고 PR 테스트, Gradle 빌드, 릴리스 생성과 운영 배포를 같은 호스트에서 수행한다.

**장점**

- CI와 CD의 실행 위치가 하나여서 초기 Workflow 구성이 단순하다.
- 별도의 AWS IAM 권한 및 리소스가 필요하지 않다.
- 운영 환경과 동일한 ARM64 환경에서 빌드하므로 별도의 Cross-build 환경을 구성하지 않아도 된다.

**단점**

- 테스트와 빌드가 운영 애플리케이션과 CPU, 메모리, 디스크를 경쟁한다.
- 작은 EC2에서 OOM, CPU Credit 고갈과 디스크 부족이 배포 및 서비스 장애로 이어질 수 있다.
- PR의 빌드와 테스트 코드가 운영 EC2에서 직접 실행되므로, 잘못된 스크립트나 의존성 문제가 실제 서비스와 비밀값에 영향을 줄 수 있다.
- EC2에 장애가 발생하면 애플리케이션뿐 아니라 CI와 CD도 함께 중단되어 같은 Runner로 재배포하거나 롤백할 수 없다.
- 소스 코드, Gradle 캐시, 빌드 도구와 Docker 빌드 캐시가 운영 서버에 누적되므로 디스크 정리와 도구 업데이트 부담이 커진다.

### 선택지 D: GitHub OIDC + AWS Systems Manager Run Command

**설명.** GitHub-hosted Runner가 테스트와 릴리스 생성을 완료한 뒤, GitHub OIDC를 통해 짧은 시간만 사용할 수 있는 AWS 권한을 발급받는다. 이후 SSM Run Command(배포 명령을 전달하고 실행 결과를 반환하는 기능)를 호출해 운영 EC2에 배포를 요청한다.

**장점**

- 테스트와 빌드를 GitHub-hosted Runner에서 수행하므로 운영 EC2에 빌드 부하와 PR 코드가 도달하지 않는다.
- 운영 EC2에 GitHub Self-hosted Runner와 Runner 토큰을 둘 필요가 없다.
- SSM Agent가 AWS로 연결을 시작하므로 GitHub Actions를 위한 인바운드 포트를 추가하지 않아도 된다.

**단점**

- GitHub OIDC 신뢰 정책, IAM Role, EC2 Instance Profile, SSM Agent와 Endpoint, Command Document를 구성해야 한다.
- 비동기 명령 상태, 시간 제한, 로그 전송, 실패 판정과 롤백 호출을 CD에서 별도로 처리해야 한다.
- 필요한 AWS 권한과 조직 정책을 현재 일정 안에서 확보할 수 있는지 확인되지 않았다.

## 결정

우리는 GitHub-hosted Runner에서 CI를 수행하고, 운영 EC2의 Self-hosted Runner는 승인된 배포만 수행하는 방식을 채택한다.

배포 흐름은 다음과 같다.

```
Pull Request
  └─ GitHub-hosted Runner: 테스트 및 정적 검증

보호된 기본 Branch 반영
  └─ GitHub-hosted Runner: CI 및 ADR-001 릴리스 생성
       └─ Production Environment 승인
            └─ EC2 배포 전용 Runner: 릴리스 검증 및 배포
                 ├─ 헬스 정상: 성공 상태 기록
                 └─ 헬스 실패: ADR-001 롤백 호출 후 실패 상태 기록
```

구체적으로 다음과 같이 구성한다.

- PR Workflow는 GitHub-hosted Runner에서만 테스트와 정적 검증을 수행한다. 운영 Environment, Registry push 권한과 런타임 비밀값에 접근하지 않는다.
- 보호된 기본 Branch의 CI가 성공하면 ADR-001의 규칙으로 릴리스를 생성하고 release ID와 릴리스 참조를 서버 외부의 배포 이력에 기록한다. CI 실패 시 CD는 시작하지 않는다.
- 배포 Job은 Production Environment 승인을 요구하며 운영 전용 Runner Group 또는 Label을 사용한다. Label만 보안 경계로 간주하지 않고 Branch 보호, CODEOWNERS, 필수 리뷰와 Environment 정책을 함께 적용한다.
- 운영 Runner는 입력받은 release ID, 허용된 Repository와 릴리스 참조 형식을 검증한 뒤 감사된 배포 명령만 수행한다. 컴파일, 테스트와 릴리스 재생성은 하지 않는다.
- GitHub의 deployment concurrency group과 호스트 측 배포 lock을 함께 사용해 Workflow, 재실행과 수동 작업이 겹치지 않게 한다.
- 배포 명령은 제한 시간 동안 localhost 또는 컨테이너 네트워크의 헬스를 polling한다. 프로세스를 시작한 결과만으로 성공 처리하지 않는다.
- 헬스 확인이 실패하면 ADR-001이 정한 직전 정상 릴리스로 롤백을 요청하고, 롤백 결과와 관계없이 해당 배포 Job은 실패로 기록한다.
- 배포 이력에는 실행자, release ID, 배포 스크립트 버전, 시작과 종료 시각과 결과를 남기되 비밀값은 기록하지 않는다.

이 선택을 한 이유는 다음과 같다.

- 빌드와 테스트를 운영 EC2 밖에서 수행해 작은 인스턴스의 자원을 서비스 실행에 우선 사용할 수 있다.
- EC2에서 GitHub로 나가는 연결만 사용하므로 GitHub를 위한 새 인바운드 포트가 필요 없다.
- 현재 확인된 AWS IAM 권한만으로 CodeDeploy와 SSM보다 빠르게 적용할 수 있다.
- Runner를 배포 전용으로 제한해 운영 호스트에서 실행되는 코드와 작업량을 줄일 수 있다.
- CI와 ADR-001의 릴리스 계약을 유지하므로 향후 배포 실행 주체만 SSM이나 CodeDeploy로 교체할 수 있다.

선택하지 않은 방식은 다음 이유로 채택하지 않는다.

- **CodeDeploy.** 다중 인스턴스 배포에서는 강점이 있지만, 현재 단일 EC2에는 Agent, IAM, AppSpec, Deployment Group 운영 부담이 상대적으로 크다.
- **운영 EC2에서 CI와 CD 모두 수행.** 운영 자원 격리와 신뢰하지 않는 코드 차단이라는 필수 조건을 만족하지 못한다. 또한 OOM 위험이 존재한다.
- **GitHub OIDC + SSM.** 상시 GitHub Runner를 제거할 수 있는 장기 후보지만, 필요한 IAM과 조직 정책을 현재 일정 안에서 구성하고 검증할 수 있는지 확인되지 않았다.

확인할 사항은 다음과 같다.

- EC2에서 GitHub와 Registry로의 DNS 및 아웃바운드 HTTPS 연결이 안정적인지
- Runner 상주 자원과 배포 중 애플리케이션 자원이 허용 범위 안인지
- Runner 업데이트 실패, 토큰 유출과 호스트 장애 시 사용할 승인된 비상 관리 경로

## 트레이드오프

### 장점

- PR 검증과 빌드 부하가 운영 서비스와 분리된다.
- 운영 Runner의 책임이 릴리스 검증, 배포, 헬스 판정과 롤백 호출로 제한된다.
- CI 성공, 운영 승인, 배포 실행과 결과를 GitHub 이력에서 연결해 확인할 수 있다.
- 추가 AWS 배포 서비스 없이 단일 EC2에 맞는 작은 구성으로 시작할 수 있다.

### 단점

- 운영 EC2에 높은 권한의 Runner가 상주하므로 Workflow 공급망과 Repository 권한 관리가 중요해진다.
- Docker socket을 사용하는 Runner는 사실상 호스트 관리자 권한을 가지며 완전한 격리가 아니다.
- GitHub 계정, Workflow 또는 Runner 토큰이 침해되면 운영 호스트까지 영향을 받을 수 있다.
- Runner 프로세스가 애플리케이션과 같은 장애 영역에 있고 소량의 상주 자원을 사용한다.
- GitHub 장애, Runner 연결 장애 또는 토큰 만료 중에는 새 배포를 수행할 수 없다.
- Runner 업데이트와 운영 스크립트 버전 차이를 팀이 관리해야 한다.
- 이 방식만으로 단일 EC2의 짧은 배포 중단이나 호스트 단일 장애 지점은 해소되지 않는다.

## 후속 결정

- Registry 선택, 릴리스 식별, 이미지 보존과 정리, 설정과 DB 호환성은 ADR-001을 따른다.
- 배포 스크립트와 Production Workflow 변경 경로에 CODEOWNERS와 필수 리뷰를 적용한다.
- Self-hosted Runner 업데이트, 재등록, 토큰 폐기, 호스트 장애와 비상 배포 Runbook을 작성한다.
- 운영용 비상 관리 경로가 무엇인지 확인하고 첫 운영 배포 전에 복구 훈련을 수행한다.
- 외부 Ingress와 TLS, RDS, 백업과 런타임 Secret 저장소는 이 ADR의 범위 밖이다.
- 무중단 또는 다중 인스턴스 배포가 필요해지면 CodeDeploy, SSM, ECS 등을 별도 ADR로 검토한다.

## 구현 체크리스트

- [ ] PR 전용 CI Workflow를 만들고 모든 Job을 GitHub-hosted Runner에서 실행한다.
- [ ] 기본 Branch용 CI에서 테스트 성공 후 ADR-001의 릴리스 생성 절차를 호출하도록 구성한다.
- [ ] Production Environment에 승인자, 허용 Branch와 배포 보호 규칙을 설정한다.
- [ ] `.github/workflows`와 운영 배포 스크립트에 CODEOWNERS와 필수 리뷰를 적용한다.
- [ ] GitHub Actions `GITHUB_TOKEN` 권한을 Job별 최소 범위로 선언하고 외부 Action을 검토된 commit SHA로 고정한다.
- [ ] 운영 EC2에 전용 Runner 사용자, Runner Group 또는 Label과 서비스 재시작 정책을 구성한다.
- [ ] PR과 fork Workflow가 운영 Runner와 Production Secret을 사용할 수 없는지 검증한다.
- [ ] EC2에는 Registry pull 전용 자격 증명만 제공하고 CI의 push 자격 증명과 분리한다.
- [ ] release ID, Repository와 릴리스 참조를 allowlist 방식으로 검증하는 배포 명령을 구현한다.
- [ ] 배포 concurrency group과 호스트 측 lock을 적용한다.
- [ ] 명시적인 헬스 polling, timeout과 ADR-001 롤백 호출을 구현한다.
- [ ] 실행자, 릴리스, 스크립트 버전, 시작과 종료 시각과 결과를 서버 외부 배포 이력에 기록한다.
- [ ] Runner 연결, 애플리케이션 헬스, OOM과 컨테이너 재시작을 모니터링한다.
- [ ] 정상 배포, 동시 배포 차단, 헬스 실패와 Runner 토큰 폐기 및 재등록을 훈련한다.
- [ ] 비상 배포와 Runner 복구 Runbook을 작성한다.
- [ ] 합의된 의사결정을 ADR 상태 Accepted로 기록한다.

단계적 적용 순서는 다음과 같다.

```
1단계: GitHub-hosted CI와 ADR-001 릴리스 생성까지 검증한다.
2단계: 운영 Runner를 등록하고 PR 차단, 권한, 연결, 배포 lock을 검증한다.
3단계: 승인된 검증 시간대에 정상 배포와 실패 주입 롤백을 수행한다.
4단계: 비상 관리 경로를 검증한 뒤 기존 임시 배포 절차를 제거한다.
```

## 검증 방법

이 결정이 실제 구현에서 지켜지는지 다음 방법으로 확인한다.

- PR과 fork에서 시작한 모든 Job의 Runner가 GitHub-hosted인지 확인한다.
- PR이 운영 Runner를 예약하거나 Production Environment와 Secret에 접근할 수 없는지 테스트한다.
- 기본 Branch CI 실패 시 릴리스 생성과 배포 Job이 시작되지 않는지 확인한다.
- 승인되지 않은 사용자 또는 Branch의 배포가 Production Environment에서 차단되는지 확인한다.
- 운영 EC2의 배포 Job 로그에 컴파일, 테스트, 릴리스 생성 단계가 없는지 확인한다.
- GitHub Actions용 인바운드 보안 그룹 규칙이 없고 필요한 아웃바운드 연결만 존재하는지 검토한다.
- 같은 환경의 배포 두 개를 동시에 요청해 GitHub concurrency와 호스트 lock이 직렬화를 보장하는지 확인한다.
- 강제로 헬스 실패를 발생시켜 CD가 실패를 기록하고 ADR-001 롤백을 호출하는지 확인한다.
- 배포 이력에 실행자, release ID, 시작과 종료 시각과 결과가 남고 Secret이 남지 않는지 확인한다.
- Runner 토큰을 폐기한 뒤 해당 Runner가 작업을 받지 못하며 Runbook으로 재등록할 수 있는지 확인한다.
- 배포 전후 애플리케이션 헬스, EC2 메모리와 CPU Credit, OOM 발생 여부를 관측한다.

완료 기준은 다음과 같다.

- PR 및 기본 Branch의 테스트와 빌드가 운영 EC2가 아닌 GitHub-hosted Runner에서 수행된다.
- 서로 다른 릴리스의 승인된 운영 배포가 연속 3회 성공하고 각 실행 이력이 남는다.
- PR과 fork 또는 승인되지 않은 Branch가 운영 Runner Job을 한 번도 예약하지 못한다.
- 같은 환경에서 두 배포가 동시에 실행되지 않는다.
- 헬스 실패를 주입했을 때 5분 안에 ADR-001의 직전 정상 릴리스가 복구되고 실패 원인이 기록된다.
- GitHub Actions를 위한 새 인바운드 규칙이 없고 배포 중 OOM과 비의도적 애플리케이션 재시작이 발생하지 않는다.
- Runner 토큰 폐기와 재등록을 Runbook만으로 재현할 수 있다.

다음 중 하나라도 충족하지 못하면 운영 배포를 중단하고 권한, Workflow 또는 배포 실행 방식을 재검토한다.

- 신뢰하지 않는 Workflow가 운영 Runner 또는 Production Secret에 접근한다.
- 동시 배포가 실행되거나 배포 대상 릴리스 검증을 우회할 수 있다.
- 헬스 실패 후 롤백 호출 또는 비상 복구가 목표 시간 안에 완료되지 않는다.
- Runner 상주 또는 배포 작업이 반복적으로 서비스 장애를 유발한다.

## 롤백 및 재검토 조건

### 롤백 방법

릴리스 내용을 직전 버전으로 되돌리는 방법은 ADR-001을 따른다. 이 ADR에서는 CI/CD 실행 경로를 중지하거나 철회하는 절차만 정의한다.

1. Production Deployment Workflow를 비활성화하고 대기 중이거나 실행 중인 배포를 중단한다.
2. Runner 침해 또는 토큰 유출 가능성이 있으면 GitHub에서 Runner 등록과 관련 토큰 및 자격 증명을 즉시 폐기한다.
3. 현재 서비스가 비정상이면 사전에 검증한 비상 관리 경로로 ADR-001의 직전 정상 릴리스 롤백을 실행한다.
4. Branch 보호, Environment, Secret과 Runner Group 설정을 마지막 정상 구성으로 복구한다.
5. Workflow가 더 이상 운영 Runner에 Job을 전달하지 않는지, 승인된 비상 경로로 배포할 수 있는지와 서비스 헬스를 확인한다.
6. Self-hosted Runner 방식을 영구 철회할 경우 새 ADR을 작성해 SSM, CodeDeploy 또는 다른 방식으로 전환한다.

### 재검토 조건

다음 상황이 발생하면 이 결정을 다시 검토한다.

- GitHub OIDC와 SSM을 최소 권한으로 구성할 AWS 권한과 조직 정책이 준비된다.
- 운영 서버에 상시 Self-hosted Runner 또는 Docker socket 권한을 둘 수 없도록 보안 정책이 변경된다.
- 운영 대상이 여러 EC2, Auto Scaling Group 또는 여러 Region으로 확장된다.
- 무중단, 순차 또는 Blue/Green 배포가 필수 요구사항이 된다.
- Runner 상주 자원, 업데이트 또는 장애 대응 비용이 합의한 운영 기준을 초과한다.
- GitHub 또는 아웃바운드 네트워크 장애 때문에 배포와 복구 목표를 반복해서 만족하지 못한다.

결정을 변경할 때는 이 ADR을 직접 덮어쓰지 않는다. 새 ADR을 작성하고 이 ADR의 상태를 Superseded로 변경한다.

## 옮긴 기록

- 2026-09-28. 팀 노션 ADR 데이터베이스에서 이 저장소로 옮겼다.
