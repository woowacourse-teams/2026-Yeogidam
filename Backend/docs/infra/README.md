# 인프라 문서

팀 노션의 ADR 데이터베이스에 있던 인프라 ADR을 2026-09-28에 이 폴더로 옮겼다. 인프라를 만드는 동안 결정이 자주 바뀌는데 노션은 왜 바뀌었는지를 남기지 않는다. 코드와 같은 PR에서 함께 고치고 diff로 변경 이유를 남기려는 것이다.

## 두 갈래로 나눠 둔다

| | 무엇을 적나 | 언제 고치나 |
| --- | --- | --- |
| **ADR** | 무엇을 왜 그렇게 정했는가 | 거의 고치지 않는다. 결정이 바뀌면 새 문서를 쓰고 옛 문서를 Superseded로 바꾼다 |
| **[current-state.md](current-state.md)** | 지금 실제로 무엇이 돌아가는가, 무엇이 아직 안 됐는가 | 인프라가 바뀔 때마다 고친다 |

ADR을 읽다가 "그래서 지금은 어떤데"가 궁금하면 `current-state.md`로 간다. 인프라를 건드리는 PR은 `current-state.md`도 같이 고친다.

## 문서 목록

| 파일 | 제목 | Status |
| --- | --- | --- |
| [current-state.md](current-state.md) | 인프라 현재 상태 | 계속 갱신 |
| [adr-01-docker-image-identity.md](adr-01-docker-image-identity.md) | Docker 이미지 식별 및 롤백 보존 전략 | Accepted |
| [adr-02-cicd-execution.md](adr-02-cicd-execution.md) | CI/CD 실행 전략 | Accepted |
| [adr-03-ec2-architecture.md](adr-03-ec2-architecture.md) | EC2 인스턴스 아키텍처와 유형 선정 | Accepted (아키텍처만. 사양 재결정 필요) |
| [adr-04-monorepo-branch.md](adr-04-monorepo-branch.md) | 모노레포 브랜치 전략 | Superseded by ADR-05 |
| [adr-05-branch-strategy.md](adr-05-branch-strategy.md) | 분야별 트렁크와 출시 브랜치 전략 | Accepted |

## 번호 규칙

이 폴더의 번호는 인프라 안에서만 센다. `Backend/docs/adr-01-instagram-url-modeling.md`의 ADR-01과는 다른 번호다. 말할 때 헷갈리면 `인프라 ADR-01`처럼 앞에 인프라를 붙인다.

## 고칠 때

- 결정을 바꿀 때는 기존 ADR을 덮어쓰지 않고 새 문서를 쓴 뒤 옛 문서의 Status를 `Superseded`로 바꾼다. 어느 문서가 대신하는지 옛 문서에 적는다.
- 구현이 ADR과 어긋나면 `current-state.md`에 적는다. ADR 본문은 건드리지 않는다.
- 아직 안 정한 것은 ADR의 「남은 결정」절에 남긴다.
- ADR-01부터 04까지의 본문은 노션 원문 그대로다. 원문 안에서 값이 갈리는 곳도 고치지 않았고, 어떻게 갈리는지는 `current-state.md`에 적었다.

## 참고

같은 기수 비비디 팀(`woowacourse-teams/2026-bibbidi`)의 CI/CD와 견준 조사는 팀 노션 「비비디 팀 CI/CD 비교 조사」에 있다. nginx와 TLS 자동화, Grafana Cloud와 Alloy 구성, 자원 상한, env 시크릿 관리, 승격 판정을 그쪽에서 가져올 수 있다.
