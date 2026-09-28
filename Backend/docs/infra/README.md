# 인프라 결정 기록

팀 노션의 ADR 데이터베이스에 있던 인프라 ADR을 2026-09-28에 이 폴더로 옮겼다. 인프라를 만드는 동안 결정이 자주 바뀌는데 노션은 왜 바뀌었는지를 남기지 않는다. 코드와 같은 PR에서 함께 고치고 diff로 변경 이유를 남기려는 것이다.

## 문서

| 파일 | 제목 | Status |
| --- | --- | --- |
| [adr-01-docker-image-identity.md](adr-01-docker-image-identity.md) | Docker 이미지 식별 및 롤백 보존 전략 | Accepted |
| [adr-02-cicd-execution.md](adr-02-cicd-execution.md) | CI/CD 실행 전략 | Accepted |
| [adr-03-ec2-architecture.md](adr-03-ec2-architecture.md) | EC2 인스턴스 아키텍처와 유형 선정 | Accepted (아키텍처만. 사양 재결정 필요) |
| [adr-04-monorepo-branch.md](adr-04-monorepo-branch.md) | 모노레포 브랜치 전략 | Superseded by ADR-05 |
| [adr-05-branch-strategy.md](adr-05-branch-strategy.md) | 분야별 트렁크와 출시 브랜치 전략 | Accepted |

## 번호 규칙

이 폴더의 번호는 인프라 안에서만 센다. `Backend/docs/adr-01-instagram-url-modeling.md`의 ADR-01과는 다른 번호다. 말할 때 헷갈리면 `인프라 ADR-01`처럼 앞에 인프라를 붙인다.

## 고칠 때

- 결정을 바꿀 때는 기존 문서를 덮어쓰지 않고 새 문서를 쓴 뒤 옛 문서의 Status를 `Superseded`로 바꾼다. 어느 문서가 대신하는지 옛 문서에 적는다.
- 구현이 문서와 어긋나면 어긋난 지점을 문서의 「구현 현황」절에 적는다. 지우지 않는다.
- 아직 안 정한 것은 「남은 결정」절에 남긴다.
- ADR-01부터 04까지의 본문은 노션 원문 그대로다. 원문 안에서 값이 갈리는 곳도 고치지 않고 문서 앞 절에 적었다.

## 안 한 것

2026-09-28 기준이고 `backend-cd.yml`과 `Backend/scripts/deploy.sh`를 봤다. 급한 순서다.

1. **컨테이너 자원 상한과 로그 로테이션이 없다.** t4g.micro 1GiB에 디스크 8GiB라 배포하면 OOM으로 죽거나 로그가 디스크를 채운다. `deploy.sh`의 `docker run`에 `--memory`와 `--log-opt`를 붙이면 된다.
2. **앞단이 없다.** `deploy.sh`가 컨테이너를 `127.0.0.1`에 묶어서 밖에서 닿지 않는다. nginx와 TLS를 올리거나 바인드 주소를 바꿔야 클라이언트가 QA를 할 수 있다.
3. **`be-release` 배포가 이미지를 다시 빌드한다.** ADR-01의 Build Once, Promote를 못 지킨다. 승격 판정이 필요하다(ADR-05의 남은 결정).
4. **관측이 없다.** actuator가 liveness만 열고 metrics는 닫혀 있다. 로그 보존, 대시보드 지표, 실패 알림이 스프린트 1 조건인데 셋 다 없다.
5. **배포 Job에 `environment:`가 없다.** Production 승인 관문이 ADR-02의 결정인데 빠졌다.
6. **외부 Action이 태그로 고정되어 있다.** ADR-02는 commit SHA 고정을 요구한다.
7. **`permissions`가 워크플로 레벨 한 곳뿐이다.** ADR-02는 Job별 최소 권한을 요구한다.
8. **배포 이력이 서버 외부에 없다.** `GITHUB_STEP_SUMMARY`까지다.
9. **env를 손으로 채웠다.** 서버가 날아가면 무슨 키가 있었는지 남지 않는다.
10. **MySQL이 없다.** dev는 EC2 Docker MySQL, prod는 RDS로 가기로 했고 둘 다 아직 만들지 않았다. 개발 서버 사양 결정이 먼저다(ADR-03).

## 참고

같은 기수 비비디 팀(`woowacourse-teams/2026-bibbidi`)의 CI/CD와 견준 조사는 팀 노션 「비비디 팀 CI/CD 비교 조사」에 있다. nginx와 TLS 자동화, Grafana Cloud와 Alloy 구성, 자원 상한, env 시크릿 관리, 승격 판정을 그쪽에서 가져올 수 있다.
