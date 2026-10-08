# 실행 프로필과 로컬 환경

작성일 2026-09-19, 갱신 2026-10-02. 프로필은 local, test, dev, prod 넷이고 넷 다 있다. dev와 prod는 2026-09-28에 붙였다(6절).

## 1. 프로필

| | local | test | dev | prod |
|---|---|---|---|---|
| 용도 | 개발자 노트북 | Gradle 테스트 | 개발 서버 | 운영 |
| DB | 로컬 MySQL(`.env`) | Testcontainers MySQL 8.4 | `yeogidam-dev-db`의 Docker MySQL 8.4 | RDS MySQL 8.4 `yeogidam-prod-db` (2026-10-02) |
| 앱 업데이트 정책(`app-update.*`) | `application.yml` 값(최소 1.1.0, 최신 1.1.0) | `application-test.yml`(E2E용 구간) | 공통값 | 공통값 |
| `schema.sql` 실행 | 기동마다 (DROP 뒤 CREATE) | 컨텍스트마다 | 안 함 | 안 함 |
| 로컬 시나리오 데이터 (`data-local.sql`) | 자동 실행 | 안 함 | DB를 지우고 다시 넣을 때 수동 적용 | 안 함 |
| 온보딩 시드 (`data-onboarding.sql`) | 자동 실행 | 안 함 | `data-local.sql` 다음에 수동 적용 | 안 함 (Supabase에서 옮겨 오는 데이터에 들어 있다) |
| OAuth | 실제 키 | Fake | 실제 키 | 실제 키 |
| Swagger | 켬 (springdoc 기본값) | 켬 (기본값) | 켬 (기본값) | 끔 (`springdoc.*.enabled: false`) |
| 로그 형식 | 텍스트 (기본값) | 텍스트 (기본값) | JSON (`logging.structured.format.console: logstash`) | JSON (dev와 같음) |
| 설정 파일 | `application-local.yml` | `src/test/resources/application-test.yml` | `application-dev.yml` | `application-prod.yml` |

`application.yml`의 `spring.sql.init.mode`는 `never`다. `schema.sql`이 `DROP TABLE`로 시작하므로 프로필 없이 서버에 올려도 테이블이 지워지지 않게 했다. local과 test만 `always`로 켠다.

프로필을 지정하지 않으면 local로 뜬다(`spring.profiles.default: local`). 서버는 `SPRING_PROFILES_ACTIVE`로 명시한다.

## 2. 로컬 실행 준비

### 2.1 `.env`

env는 노션 페이지를 참고한다.

### 2.2 로컬 실행용 데이터

기동마다 `schema.sql`이 테이블을 새로 만든 뒤 `data-local.sql`, `data-onboarding.sql` 순서로 데이터가 들어간다. 재시작하면 항상 같은 상태다.

- `data-local.sql`: 장소 8개, 릴스 7개, 공유 9건, 보관함 5행, 제보 1건. 정콩(회원 1)과 러키(회원 2) 시나리오이고 파일 머리 주석에 적혀 있다.
- `data-onboarding.sql`: 군자역 디저트 캐러셀의 게시물 1개, 장소 5개, 게시물과 장소 연결 5개다. 로컬에서는 `data-local.sql` 다음에 자동 실행되고, 개발 DB에는 `data-local.sql`을 넣은 뒤 같은 파일을 직접 넣는다. 운영에는 넣지 않는다. 컷오버 때 Supabase에서 옮겨 오는 데이터에 이 게시물이 SUCCEEDED로 들어 있고 연결된 장소 5개의 `kakao_place_id`가 이 파일, FE 번들과 같아야 한다. `media_shortcode`, `kakao_place_id`를 기준으로 upsert해 재적용해도 중복되지 않는다.
- 회원 행은 `LocalMemberSeeder`가 넣는다. `.env`의 `SEED_KAKAO_USER_ID_BEAN`이 회원 1, `SEED_KAKAO_USER_ID_LUCKY`가 회원 2다.
- 카카오 회원 번호를 환경변수로 관리하기 위해 `LocalMemberSeeder` 클래스를 생성했다. SQL 파일은 환경변수를 못 읽어서 회원만 자바로 뺐다.

로그인은 카카오 회원번호로 `members`를 찾는다. 
`.env`의 값이 내 회원번호면 회원 1이나 2로 들어가고, 아니면 새 회원이 생겨 보관함이 비어 보인다.

회원번호를 모르면:

1. `SEED_KAKAO_USER_ID_*`를 비운 채 앱을 띄우고 3절대로 로그인한다.
2. `SELECT id, CAST(provider_user_id AS CHAR) FROM members;` 결과의 숫자가 회원번호다.
3. `.env`의 자기 키에 넣고 다시 띄운다.
4. 3절대로 다시 로그인한다. 이번에는 회원 1이나 2로 들어가고, 이후 재시작해도 같은 회원이다.

## 3. 로컬 실행과 Swagger 확인

```bash
cd Backend
./gradlew bootRun
```

IntelliJ는 실행 버튼만 누르면 된다. 기동 로그에 `falling back to 1 default profile: "local"`이 보이면 맞다.

1. 브라우저에서 인가 코드를 받는다. 로그인하면 `.../oauth/kakao/callback?code=XXXX`로 돌아오고 404가 떠도 된다. 주소창의 `code=` 값만 복사한다. 코드는 한 번 쓰면 무효다.

   ```
   https://kauth.kakao.com/oauth/authorize?client_id={KAKAO_CLIENT_ID}&redirect_uri={KAKAO_REDIRECT_URI}&response_type=code
   ```

2. Swagger(`http://localhost:8080/swagger-ui/index.html`)에서 `POST /api/v1/auth/logins/kakao`에 `{"authorizationCode": "XXXX"}`를 보내 `accessToken`을 받는다.
3. Authorize에 `accessToken`을 넣는다. 30분이면 만료된다.
4. `GET /api/v1/saved-places`에서 정콩의 보관함 2건과 러키의 보관함 3건을 확인한다. 공유 히스토리는 `GET /api/v1/shares`, 각 공유의 추출 장소는 `GET /api/v1/shares/{sharedMediaId}/places`에서 확인한다.

## 4. 테스트

```bash
cd Backend
./gradlew test
```

Docker가 켜져 있어야 한다. `MySqlContainerSupport`가 `mysql:8.4` 컨테이너를 띄우고 `schema.sql`로 테이블을 만든다.

- `@JdbcTest`는 트랜잭션 롤백, E2E는 메서드마다 `cleanup.sql` TRUNCATE로 격리한다.
- 테스트 데이터는 `src/test/resources/*.sql`을 `@Sql({"/members.sql", "/places.sql"})`처럼 골라 심는다.
- `data-local.sql`과 `LocalMemberSeeder`는 local 프로필에서만 돈다.

## 5. 자주 발생하는 오류

| 증상 | 원인 | 조치 |
|---|---|---|
| `Access denied for user 'root'@'localhost'` | `.env`의 `DB_PASSWORD`가 다름 | `.env` 수정 |
| `Unknown database 'yeogidam'` | DB를 안 만듦 | `CREATE DATABASE yeogidam;` |
| 테이블은 있는데 데이터가 없음 | local이 아닌 프로필로 뜸 | 기동 로그의 프로필 확인 |
| 로그인은 되는데 보관함이 빈 배열 | `.env`의 `SEED_KAKAO_USER_ID_*`가 비었거나 내 회원번호가 아님 | 2.2절 |
| 로그인이 401 `INVALID_CREDENTIAL` | 인가 코드를 두 번 씀, 또는 리다이렉트 URI 불일치 | 코드를 새로 받는다 |
| 테스트가 전부 `ExceptionInInitializerError` | Docker 꺼짐 | Docker 실행 |

## 6. dev와 prod

- `application-dev.yml`과 `application-prod.yml`을 만들었다(2026-09-28). 둘 다 `spring.sql.init.mode: never`를 명시해 공통값이 바뀌어도 서버에서 테이블이 지워지지 않게 한다. prod는 `springdoc.api-docs.enabled: false`, `springdoc.swagger-ui.enabled: false`로 문서를 닫는다. 둘 다 `logging.structured.format.console: logstash`로 로그를 JSON 한 줄로 찍는다. CloudWatch 지표 필터가 level 키로 ERROR를 세기 위해서다.
- 배포 산출물은 태그가 아니라 Docker digest(`yeogidam/backend@sha256:...`)로 고정한다. digest로만 pull하면 로컬에서 태그가 없어 dangling으로 분류되므로, `deploy.sh`가 pull 직후 커밋 SHA 태그와 역할 태그(`candidate`)를 붙이고 배포가 성공하면 역할 태그를 `current`로 옮기며 기존 `current`를 `previous`로 내린다. 롤백 대상은 `previous` 태그로 찾는다(ADR-01).
- 이미지 정리는 `current`, `previous`, `candidate`가 가리키는 digest와 실행 중인 컨테이너의 이미지를 먼저 삭제 금지 목록으로 만든 뒤, `yeogidam/backend` 저장소의 나머지 이미지만 지운다. 서버 전체를 대상으로 하는 `docker image prune`은 쓰지 않는다. 보존 대상을 찾지 못하면 정리를 건너뛴다.
- 배포는 GitHub Actions self-hosted 러너가 EC2에서 직접 한다. 러너 계정은 `github-runner`이고 `docker` 그룹에 속한다. 환경변수는 저장소에 두지 않고 각 서버의 `/opt/yeogidam/backend.env`가 들고 있으며 `deploy.sh`가 `--env-file`로 넘긴다.
- 앱 업데이트 정책은 프로필로 나누지 않고 `application.yml` 한 곳에 리터럴로 둔다. 값을 바꿀 때는 커밋하고 배포하며, 스토어 점진적 출시가 100%가 된 뒤에만 최소 지원 버전을 올린다. 설정 파일에 두는 이유는 값 변경이 PR로 남고 잘못된 값을 `PlatformPolicy` 생성자 검증이 CI에서 잡기 때문이다. 환경변수로 뺐을 때의 이득도 이 구조에서는 실현되지 않는다. `--env-file`은 컨테이너를 만들 때만 읽히고 `deploy.sh`는 같은 이미지면 컨테이너를 교체하지 않아서, 서버의 값만 고치면 `Infra/scripts/restart-backend.sh`로 손배포해야 반영된다.
- **`APP_UPDATE_*` 환경변수는 yml을 리터럴로 적어도 값을 덮는다.** 스프링 부트의 relaxed binding이 `APP_UPDATE_ANDROID_MINIMUM_SUPPORTED_VERSION`을 `app-update.android.minimum-supported-version`으로 매핑하고, 환경변수가 설정 파일보다 우선순위가 높기 때문이다. 그래서 값을 급히 바꿔야 하면 서버 env에 넣어 덮을 수는 있지만, 이력이 남지 않으므로 비상용으로만 쓴다. 반대로 로컬 셸에 `APP_UPDATE_*`를 띄워 두면 `application-test.yml`의 E2E 픽스처가 덮여 앱 정책 테스트가 깨진다. 최소 버전이 최신 버전보다 높아지면 생성자 검증이 예외를 던져 컨텍스트가 뜨지 못해 그 클래스 전부가 실패하므로, 원인이 값 하나라는 것이 드러나지 않는다. 이 테스트가 이유 없이 깨지면 셸 환경변수를 먼저 본다.
- dev에서만 다른 버전으로 강제 업데이트 동작을 시험하려면 `application-dev.yml`에 `app-update` 블록을 넣는다. 그것도 커밋이라 어떤 값으로 시험했는지 남는다. 프로필 파일은 적은 키만 덮으므로 `store-url`처럼 그대로 둘 값은 다시 적지 않는다. **최소 지원 버전만 올리면 안 된다.** 최신 버전이 `application.yml` 기본값으로 남아 최소보다 낮아지고, `PlatformPolicy` 생성자 검증이 예외를 던져 컨텍스트가 뜨지 못한다. 최소를 올릴 때는 최신도 같이 올린다. 평소에는 블록을 두지 않아 dev가 공통값을 그대로 따라가게 한다. 값을 복사해 두면 나중에 공통값을 올렸을 때 dev만 옛 값에 묶여, 정작 먼저 확인해야 할 곳이 확인되지 않는다.
- 스키마 변경은 dev와 prod 양쪽에 손으로 적용한다. 운영 첫 스키마는 2026-10-02에 `be-release`의 `schema.sql`을 RDS에 그대로 넣어 만들었다. **이 파일은 `DROP TABLE IF EXISTS`로 시작하므로 운영에 다시 돌리면 데이터가 전부 지워진다.** 운영 스키마 변경은 바뀐 문장만 골라 적용하고, 컷오버 전에 Flyway를 넣어 이 손작업을 없앤다.
- Dockerfile이 `SPRING_PROFILES_ACTIVE`를 받고, 서버의 `/opt/yeogidam/backend.env`가 `.env`와 같은 이름의 환경변수를 넣는다([인프라 현재 상태](infra/current-state.md) 「환경 설정」).
- DB URL은 `connectionTimeZone=UTC&forceConnectionTimeZoneToSession=true&preserveInstants=true`를 쓰고 MySQL `time_zone`은 UTC다(됨). 서버 env의 `DB_URL`이 이 파라미터를 갖고, 개발 Docker MySQL과 RDS 모두 `time_zone` 기본값이 UTC라 따로 맞추지 않았다. DAO가 UTC로 읽고 쓴다.
- 카카오 콘솔에 dev와 prod 리다이렉트 URI를 등록한다. 아직이다. 앱이 실제로 쓸 콜백 주소가 정해지면 서버 env의 `KAKAO_REDIRECT_URI`와 함께 맞춘다([사고 기록 2026-10-01](infra/incidents/2026-10-01-dev-kakao-login-503.md)).
