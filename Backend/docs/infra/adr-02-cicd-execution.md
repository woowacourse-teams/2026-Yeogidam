# 인프라 ADR-02. CI/CD 실행 전략

| | |
| --- | --- |
| Status | Accepted (2026-09-28) |
| Area | Infrastructure |
| Category | Rollback, CI/CD, Docker |
| Date | 2026-08-25 |

문서 안의 `ADR-001`은 [인프라 ADR-01](adr-01-docker-image-identity.md)을 가리키며, 노션에 있던 표기를 그대로 두었다.

현재 구현 상태는 [current-state.md](current-state.md)를 본다.

## 결정 요약

CI는 GitHub-hosted Runner에서 수행하고, CD는 운영 EC2의 배포 전용 Self-hosted Runner에서 수행한다. 운영 EC2에 빌드 부하를 주지 않고 승인된 릴리스만 안전하게 배포하려고 이 방식을 채택한다.

## 맥락과 문제

테스트와 릴리스 생성 작업을 어디에서 실행하고, 승인된 릴리스를 어떤 경로와 권한으로 운영 EC2에 전달할지 결정해야 한다. CI 실패가 운영 배포로 이어지지 않아야 하고, 배포 작업은 누가 승인하고 누가 실행했으며 어떤 릴리스를 배포해 어떤 결과가 났는지 추적할 수 있어야 한다.

초기 운영 대상은 자원이 작은 단일 ARM64 EC2 인스턴스(t4g.micro)다. 운영 애플리케이션과 Gradle 테스트, 빌드가 같은 CPU와 메모리와 디스크를 두고 경쟁하면 서비스 장애로 이어질 수 있으므로, 운영 EC2에는 배포에 필요한 최소 작업만 남겨야 한다.

GitHub Actions 때문에 EC2에 새 인바운드 포트를 열지는 않는다고 전제한다. CodeDeploy와 SSM도 배포 실행 방식으로 쓸 수 있다. 다만 여기에 필요한 AWS IAM Role과 Instance Profile, 조직 정책을 지금 확인된 권한과 일정 안에서 구성할 수 있는지는 아직 검증하지 못했다. 운영 Workflow를 구현하기 전에 실행 위치와 신뢰 경계, 장애 복구 절차를 먼저 확정해야 한다.

## 결정 기준

다음 기준을 중요도 순서로 놓고 이번 결정을 평가한다.

1. 신뢰하지 않는 코드는 운영 EC2에서 실행되지 않아야 하고, 테스트와 빌드 부하도 운영 EC2에서 떼어 놓아야 한다.
2. 새 인바운드 포트 없이 지금 확인된 네트워크와 IAM 권한 안에서 구현할 수 있어야 한다.
3. 배포 실패를 명확히 판정하고 직전 정상 릴리스로 롤백할 수 있어야 한다.
4. 단일 EC2에서 관리할 구성 요소는 되도록 줄인다.

## 검토한 선택지

### 선택지 A: GitHub-hosted CI + 운영 EC2의 배포 전용 Self-hosted Runner

**설명.** PR 검증과 기본 Branch의 릴리스 생성은 GitHub-hosted Runner에서 수행한다. 운영 배포가 승인되면 EC2에 설치한 Self-hosted Runner가 GitHub에서 배포 Job을 받는다. GitHub는 Runner에 release ID와 배포 명령을 전달하고, Runner는 Registry에서 해당 릴리스를 가져와 애플리케이션을 교체한다. 운영 Runner는 컴파일이나 테스트를 하지 않고, 릴리스 검증과 배포, 헬스 체크, ADR-001의 롤백 호출만 수행한다.

**장점**

- PR 테스트와 빌드를 GitHub-hosted Runner에서 수행하므로 운영 EC2에 빌드 부하가 걸리지 않는다.
- EC2 Runner가 GitHub로 아웃바운드 HTTPS 연결을 열기 때문에 GitHub용 인바운드 포트가 필요 없다.
- GitHub의 CI 결과와 Environment 승인, 실행자, Job 로그를 한 흐름에서 추적할 수 있다.
- CodeDeploy나 SSM에 필요한 AWS IAM Role과 추가 배포 리소스 없이 시작할 수 있다.
- 지금 단일 EC2에 필요한 배포 동작만 구현하므로 도입 범위가 작다.

**단점**

- 운영 서버에서 GitHub Actions Runner 프로세스가 늘 돌아간다.
- GitHub 제어 영역에 장애가 있거나 Runner 연결이 끊기면 새 배포를 실행할 수 없다.
- Runner 업데이트와 재등록, 토큰 폐기, 장애 복구를 팀이 직접 맡아야 한다.
- 단일 EC2의 컨테이너 교체 방식이므로 이 결정만으로 무중단 배포가 보장되지는 않는다.

### 선택지 B: AWS CodeDeploy

**설명.** GitHub-hosted Runner가 CI와 릴리스 생성을 마친 뒤 CodeDeploy Deployment에 배포를 요청한다. CodeDeploy는 배포 대상 EC2와 실행 순서를 관리하고, EC2에 설치한 CodeDeploy Agent는 AppSpec에 적어 둔 배포 스크립트를 실행한다.

**장점**

- 테스트와 빌드를 GitHub-hosted Runner에서 수행하므로 운영 EC2에는 빌드 부하도 PR 코드도 닿지 않는다.
- 운영 EC2에 GitHub Self-hosted Runner와 Runner 토큰을 둘 필요가 없다.
- 배포 대상과 단계별 실행 결과, 성공과 실패 이력을 AWS에서 확인할 수 있다.
- 여러 인스턴스와 Auto Scaling Group, Load Balancer를 도입하면 순차 배포나 Blue/Green 배포로 확장하기 좋다.

**단점**

- EC2에 CodeDeploy Agent를 설치하고 업데이트해야 한다.
- CodeDeploy Service Role과 EC2 Instance Profile, Deployment Group, AppSpec을 추가로 구성해야 한다.
- GitHub Actions가 CodeDeploy 배포를 요청할 수 있도록 OIDC 또는 AWS 자격 증명과 IAM 권한을 구성해야 한다.
- 지금처럼 EC2가 한 대일 때는 배포 이력 관리로 얻는 이점보다 IAM과 Agent, AWS 리소스를 관리하는 부담이 더 클 수 있다.

### 선택지 C: 운영 EC2의 Self-hosted Runner가 CI와 CD를 모두 수행

**설명.** 운영 EC2에 GitHub Actions Runner와 빌드 도구를 설치하고, PR 테스트와 Gradle 빌드, 릴리스 생성, 운영 배포를 같은 호스트에서 수행한다.

**장점**

- CI와 CD의 실행 위치가 하나여서 초기 Workflow 구성이 단순하다.
- AWS IAM 권한과 리소스를 따로 만들지 않아도 된다.
- 운영과 같은 ARM64 환경에서 빌드하므로 Cross-build 환경을 따로 구성하지 않아도 된다.

**단점**

- 테스트와 빌드가 운영 애플리케이션과 CPU와 메모리와 디스크를 두고 경쟁한다.
- 작은 EC2에서는 OOM과 CPU Credit 고갈, 디스크 부족이 배포 장애와 서비스 장애로 이어질 수 있다.
- PR의 빌드와 테스트 코드가 운영 EC2에서 그대로 실행되므로 잘못된 스크립트나 의존성 문제가 실제 서비스와 비밀값까지 건드릴 수 있다.
- EC2에 장애가 발생하면 애플리케이션뿐 아니라 CI와 CD도 함께 중단되어 같은 Runner로 재배포하거나 롤백할 수 없다.
- 소스 코드와 Gradle 캐시, 빌드 도구, Docker 빌드 캐시가 운영 서버에 쌓이므로 디스크 정리와 도구 업데이트 부담이 커진다.

### 선택지 D: GitHub OIDC + AWS Systems Manager Run Command

**설명.** GitHub-hosted Runner가 테스트와 릴리스 생성을 마친 뒤 GitHub OIDC로 짧은 시간만 쓸 수 있는 AWS 권한을 발급받는다. 이어서 SSM Run Command(배포 명령을 전달하고 실행 결과를 반환하는 기능)를 호출해 운영 EC2에 배포를 요청한다.

**장점**

- 테스트와 빌드를 GitHub-hosted Runner에서 수행하므로 운영 EC2까지 빌드 부하와 PR 코드가 오지 않는다.
- 운영 EC2에 GitHub Self-hosted Runner와 Runner 토큰을 둘 필요가 없다.
- SSM Agent가 AWS로 연결을 시작하므로 GitHub Actions용 인바운드 포트를 추가하지 않아도 된다.

**단점**

- GitHub OIDC 신뢰 정책과 IAM Role, EC2 Instance Profile, SSM Agent와 Endpoint, Command Document를 구성해야 한다.
- 비동기 명령 상태와 시간 제한, 로그 전송, 실패 판정, 롤백 호출을 CD에서 따로 처리해야 한다.
- 여기에 필요한 AWS 권한과 조직 정책을 지금 일정 안에서 확보할 수 있는지 아직 확인하지 못했다.

## 결정

GitHub-hosted Runner에서 CI를 수행하고, 운영 EC2의 Self-hosted Runner는 승인된 배포만 수행하는 방식을 채택한다.

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

- PR Workflow는 GitHub-hosted Runner에서만 테스트와 정적 검증을 수행하고, 운영 Environment와 Registry push 권한, 런타임 비밀값에는 접근하지 않는다.
- 보호된 기본 Branch의 CI가 성공하면 ADR-001의 규칙으로 릴리스를 생성하고 release ID와 릴리스 참조를 서버 외부의 배포 이력에 기록한다. CI가 실패하면 CD를 시작하지 않는다.
- 배포 Job은 Production Environment 승인을 요구하며 운영 전용 Runner Group 또는 Label을 사용한다. Label 하나만 보안 경계로 보지 않고, Branch 보호와 CODEOWNERS, 필수 리뷰, Environment 정책을 함께 적용한다.
- 운영 Runner는 입력받은 release ID와 허용된 Repository, 릴리스 참조 형식을 검증한 뒤 감사를 거친 배포 명령만 수행하고, 컴파일과 테스트, 릴리스 재생성은 하지 않는다.
- GitHub의 deployment concurrency group과 호스트 측 배포 lock을 함께 사용해 Workflow와 재실행, 수동 작업이 서로 겹치지 않게 한다.
- 배포 명령은 제한 시간 동안 localhost나 컨테이너 네트워크의 헬스를 polling하며, 프로세스를 시작했다는 것만으로 성공 처리하지 않는다.
- 헬스 확인이 실패하면 ADR-001이 정한 직전 정상 릴리스로 롤백을 요청하고, 롤백 결과와 관계없이 해당 배포 Job은 실패로 기록한다.
- 배포 이력에는 실행자와 release ID, 배포 스크립트 버전, 시작과 종료 시각, 결과를 남기되 비밀값은 기록하지 않는다.

이렇게 정한 이유는 다음과 같다.

- 빌드와 테스트를 운영 EC2 밖에서 수행해 작은 인스턴스의 자원을 서비스 실행에 먼저 쓸 수 있다.
- EC2에서 GitHub로 나가는 연결만 사용하므로 GitHub용 새 인바운드 포트가 필요 없다.
- 지금 확인된 AWS IAM 권한만으로 CodeDeploy와 SSM보다 빠르게 적용할 수 있다.
- Runner를 배포 전용으로 제한해 운영 호스트에서 돌아가는 코드와 작업량을 줄일 수 있다.
- CI와 ADR-001의 릴리스 계약을 유지하므로 나중에 배포 실행 주체만 SSM이나 CodeDeploy로 바꿀 수 있다.

나머지 선택지를 채택하지 않은 이유는 다음과 같다.

- **CodeDeploy.** 여러 인스턴스에 배포할 때는 강점이 있지만, EC2가 한 대인 지금은 Agent와 IAM, AppSpec, Deployment Group을 운영하는 부담이 상대적으로 크다.
- **운영 EC2에서 CI와 CD 모두 수행.** 운영 자원 격리와 신뢰하지 않는 코드 차단이라는 필수 조건을 만족하지 못하고, OOM 위험도 있다.
- **GitHub OIDC + SSM.** 상시 GitHub Runner를 없앨 수 있는 장기 후보지만, 여기에 필요한 IAM과 조직 정책을 지금 일정 안에서 구성하고 검증할 수 있는지 아직 확인하지 못했다.

확인할 사항은 다음과 같다.

- EC2에서 GitHub와 Registry로 나가는 DNS와 아웃바운드 HTTPS 연결이 안정적인지
- Runner가 상주하며 쓰는 자원과 배포 중 애플리케이션이 쓰는 자원이 허용 범위 안인지
- Runner 업데이트 실패와 토큰 유출, 호스트 장애가 났을 때 쓸 승인된 비상 관리 경로

## 트레이드오프

### 장점

- PR 검증과 빌드 부하가 운영 서비스와 분리된다.
- 운영 Runner의 책임은 릴리스 검증과 배포, 헬스 판정, 롤백 호출로 제한된다.
- CI 성공과 운영 승인, 배포 실행, 결과를 GitHub 이력에서 이어서 확인할 수 있다.
- 추가 AWS 배포 서비스 없이 단일 EC2에 맞는 작은 구성으로 시작할 수 있다.

### 단점

- 운영 EC2에 높은 권한의 Runner가 상주하므로 Workflow 공급망과 Repository 권한 관리가 중요해진다.
- Docker socket을 쓰는 Runner는 사실상 호스트 관리자 권한을 쥐므로 완전한 격리가 아니다.
- GitHub 계정이나 Workflow, Runner 토큰이 침해되면 운영 호스트까지 영향을 받을 수 있다.
- Runner 프로세스는 애플리케이션과 같은 장애 영역에 있고, 적은 양이지만 자원을 계속 쓴다.
- GitHub 장애나 Runner 연결 장애, 토큰 만료가 이어지는 동안에는 새 배포를 할 수 없다.
- Runner 업데이트와 운영 스크립트 버전 차이를 팀이 관리해야 한다.
- 이 방식만으로 단일 EC2의 짧은 배포 중단이나 호스트 단일 장애 지점은 해소되지 않는다.

## 후속 결정

- Registry 선택과 릴리스 식별, 이미지 보존과 정리, 설정과 DB 호환성은 ADR-001을 따른다.
- 배포 스크립트와 Production Workflow 변경 경로에 CODEOWNERS와 필수 리뷰를 적용한다.
- Self-hosted Runner 업데이트와 재등록, 토큰 폐기, 호스트 장애 대응, 비상 배포를 다루는 Runbook을 작성한다.
- 운영용 비상 관리 경로가 무엇인지 확인하고 첫 운영 배포 전에 복구 훈련을 수행한다.
- 외부 Ingress와 TLS, RDS, 백업과 런타임 Secret 저장소는 이 ADR의 범위 밖이다.
- 무중단 배포나 여러 인스턴스 배포가 필요해지면 CodeDeploy와 SSM, ECS 등을 별도 ADR에서 검토한다.

## 구현 체크리스트

- [ ] PR 전용 CI Workflow를 만들고 모든 Job을 GitHub-hosted Runner에서 실행한다.
- [ ] 기본 Branch용 CI에서 테스트가 성공하면 ADR-001의 릴리스 생성 절차를 호출하도록 구성한다.
- [ ] Production Environment에 승인자와 허용 Branch, 배포 보호 규칙을 설정한다.
- [ ] `.github/workflows`와 운영 배포 스크립트에 CODEOWNERS와 필수 리뷰를 적용한다.
- [ ] GitHub Actions `GITHUB_TOKEN` 권한을 Job별 최소 범위로 선언하고 외부 Action을 검토를 마친 commit SHA로 고정한다.
- [ ] 운영 EC2에 전용 Runner 사용자와 Runner Group 또는 Label, 서비스 재시작 정책을 구성한다.
- [ ] PR과 fork Workflow가 운영 Runner와 Production Secret을 사용할 수 없는지 검증한다.
- [ ] EC2에는 Registry pull 전용 자격 증명만 제공하고 CI의 push 자격 증명과 분리한다.
- [ ] release ID와 Repository, 릴리스 참조를 allowlist 방식으로 검증하는 배포 명령을 구현한다.
- [ ] 배포 concurrency group과 호스트 측 lock을 적용한다.
- [ ] 헬스 polling과 timeout, ADR-001 롤백 호출을 명시적으로 구현한다.
- [ ] 실행자와 릴리스, 스크립트 버전, 시작과 종료 시각, 결과를 서버 외부 배포 이력에 기록한다.
- [ ] Runner 연결과 애플리케이션 헬스, OOM, 컨테이너 재시작을 모니터링한다.
- [ ] 정상 배포와 동시 배포 차단, 헬스 실패, Runner 토큰 폐기와 재등록을 훈련한다.
- [ ] 비상 배포와 Runner 복구 Runbook을 작성한다.
- [ ] 합의한 의사결정을 ADR 상태 Accepted로 기록한다.

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
- 기본 Branch CI가 실패하면 릴리스 생성과 배포 Job이 시작되지 않는지 확인한다.
- 승인되지 않은 사용자나 Branch의 배포가 Production Environment에서 막히는지 확인한다.
- 운영 EC2의 배포 Job 로그에 컴파일과 테스트, 릴리스 생성 단계가 없는지 확인한다.
- GitHub Actions용 인바운드 보안 그룹 규칙이 없고 필요한 아웃바운드 연결만 있는지 검토한다.
- 같은 환경의 배포 두 개를 동시에 요청해 GitHub concurrency와 호스트 lock이 직렬화를 보장하는지 확인한다.
- 강제로 헬스 실패를 발생시켜 CD가 실패를 기록하고 ADR-001 롤백을 호출하는지 확인한다.
- 배포 이력에 실행자와 release ID, 시작과 종료 시각, 결과가 남고 Secret은 남지 않는지 확인한다.
- Runner 토큰을 폐기한 뒤 해당 Runner가 작업을 받지 못하며 Runbook으로 재등록할 수 있는지 확인한다.
- 배포 전후로 애플리케이션 헬스와 EC2 메모리, CPU Credit, OOM 발생 여부를 관측한다.

완료 기준은 다음과 같다.

- PR과 기본 Branch의 테스트와 빌드가 운영 EC2가 아니라 GitHub-hosted Runner에서 수행된다.
- 서로 다른 릴리스의 승인된 운영 배포가 연속 3회 성공하고 각 실행 이력이 남는다.
- PR과 fork, 승인되지 않은 Branch가 운영 Runner Job을 한 번도 예약하지 못한다.
- 같은 환경에서 두 배포가 동시에 실행되지 않는다.
- 헬스 실패를 주입했을 때 5분 안에 ADR-001의 직전 정상 릴리스가 복구되고 실패 원인이 기록된다.
- GitHub Actions용 새 인바운드 규칙이 없고, 배포 중에 OOM과 의도하지 않은 애플리케이션 재시작이 일어나지 않는다.
- Runner 토큰 폐기와 재등록을 Runbook만으로 재현할 수 있다.

다음 중 하나라도 일어나면 운영 배포를 중단하고 권한이나 Workflow, 배포 실행 방식을 재검토한다.

- 신뢰하지 않는 Workflow가 운영 Runner 또는 Production Secret에 접근한다.
- 동시 배포가 실행되거나 배포 대상 릴리스 검증을 우회할 수 있다.
- 헬스 실패 후 롤백 호출이나 비상 복구가 목표 시간 안에 끝나지 않는다.
- Runner 상주나 배포 작업이 반복해서 서비스 장애를 일으킨다.

## 롤백 및 재검토 조건

### 롤백 방법

릴리스 내용을 직전 버전으로 되돌리는 방법은 ADR-001을 따른다. 이 ADR에서는 CI/CD 실행 경로를 중지하거나 철회하는 절차만 정의한다.

1. Production Deployment Workflow를 비활성화하고 대기 중이거나 실행 중인 배포를 중단한다.
2. Runner가 침해됐거나 토큰이 유출됐을 가능성이 있으면 GitHub에서 Runner 등록과 관련 토큰, 자격 증명을 즉시 폐기한다.
3. 서비스가 지금 비정상이면 미리 검증해 둔 비상 관리 경로로 ADR-001의 직전 정상 릴리스 롤백을 실행한다.
4. Branch 보호와 Environment, Secret, Runner Group 설정을 마지막 정상 구성으로 되돌린다.
5. Workflow가 더 이상 운영 Runner에 Job을 넘기지 않는지, 승인된 비상 경로로 배포할 수 있는지, 서비스 헬스는 정상인지 확인한다.
6. Self-hosted Runner 방식을 영구히 철회할 때는 새 ADR을 작성해 SSM이나 CodeDeploy, 다른 방식으로 전환한다.

### 재검토 조건

다음 상황이 발생하면 이 결정을 다시 검토한다.

- GitHub OIDC와 SSM을 최소 권한으로 구성할 AWS 권한과 조직 정책이 준비된다.
- 보안 정책이 바뀌어 운영 서버에 Self-hosted Runner를 상시 두거나 Docker socket 권한을 줄 수 없게 된다.
- 운영 대상이 여러 EC2나 Auto Scaling Group, 여러 Region으로 확장된다.
- 무중단 배포나 순차 배포, Blue/Green 배포가 필수 요구사항이 된다.
- Runner 상주 자원과 업데이트, 장애 대응 비용이 합의한 운영 기준을 넘는다.
- GitHub나 아웃바운드 네트워크 장애 때문에 배포와 복구 목표를 반복해서 만족하지 못한다.

결정을 바꿀 때는 이 ADR을 직접 덮어쓰지 않고, 새 ADR을 작성한 뒤 이 ADR의 상태를 Superseded로 바꾼다.

## 옮긴 기록

- 2026-09-28. 팀 노션 ADR 데이터베이스에서 이 저장소로 옮겼다.
- 2026-09-28. 「검증 방법」 끝의 중단 조건에서 `다음 중 하나라도 충족하지 못하면`을 `다음 중 하나라도 일어나면`으로 고쳤다. 뒤따르는 네 항목이 일어나면 안 되는 상황인데 앞 문장이 부정으로 받아서, 읽는 대로면 사고가 나지 않아야 배포를 중단하는 뜻이 됐다. 결정 내용은 바뀌지 않았고 문장만 바로잡았다.
