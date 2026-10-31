# 실행 프로필과 로컬 환경

작성일 2026-09-19, 갱신 2026-10-31.

## 1. 프로필

| | local | test | dev | prod |
|---|---|---|---|---|
| 용도 | 개발자 노트북 | Gradle 테스트 | 개발 서버 | 운영 |
| DB | 로컬 MySQL(`.env`) | Testcontainers MySQL 8.4 | `yeogidam-dev-db`의 Docker MySQL 8.4 | RDS MySQL 8.4 `yeogidam-prod-db` (2026-10-02) |
| 앱 업데이트 정책(`app-update.*`) | `application.yml` 값(최소 2.2.0, 최신 2.2.0) | `application-test.yml`(E2E용 구간) | 공통값 | 공통값 |
| Spring Boot의 Flyway 자동 실행 | 기본값 `true` | `false`. 공통 지원 코드에서 직접 실행 | 기본값 `true` | 기본값 `true` |
| Flyway 접속 계정 | `DB_*`와 동일 | 테스트 컨테이너 계정 | `FLYWAY_*` 전용 계정 | `FLYWAY_*` 전용 계정 |
| 구조 준비 | 매 기동 미적용 버전만 실행 | 공용 컨테이너 최초 준비 시 V1부터 모든 버전 실행 | 서버 시작 시 미적용 버전 실행 | 서버 시작 시 미적용 버전 실행 |
| 데이터 정리 | 매 기동 업무 데이터와 ID만 TRUNCATE. 구조와 Flyway 기록은 유지 | 각 테스트 전에 업무 데이터와 ID만 TRUNCATE. 구조와 Flyway 기록은 유지 | 전체 초기화 없음 | 전체 초기화 없음 |
| 로컬 시나리오 데이터 (`db/seed/data-local.sql`) | 자동 실행 | 안 함 | 필요하면 회원 1, 2를 준비한 뒤 수동 적용 | 안 함 |
| 온보딩 시드 (`db/seed/data-onboarding.sql`) | 자동 실행 | 안 함 | 필요할 때 수동 적용 | 필요할 때 수동 적용 |
| OAuth | 실제 키 | Fake | 실제 키 | 실제 키 |
| 인스타그램 썸네일 저장 경로 | `yeogidam/local/instagram-thumbnails` | Fake가 미리 정한 파일 키를 반환하며 실제 S3 업로드는 하지 않음 | `yeogidam/dev/instagram-thumbnails` | `yeogidam/prod/instagram-thumbnails` |
| 장소 썸네일 저장 경로 | `yeogidam/local/place-thumbnails` | Fake가 사진 주소를 `null`로 반환해 업로드를 생략 | `yeogidam/dev/place-thumbnails` | `yeogidam/prod/place-thumbnails` |
| Swagger | 켬 (springdoc 기본값) | 켬 (기본값) | 켬 (기본값) | 끔 (`springdoc.*.enabled: false`) |
| 로그 형식 | 텍스트 (기본값) | 텍스트 (기본값) | JSON (`logging.structured.format.console: logstash`) | JSON (dev와 같음) |
| 설정 파일 | `application-local.yml` | `src/test/resources/application-test.yml` | `application-dev.yml` | `application-prod.yml` |

`spring.sql.init.mode: never`는 공통 `application.yml`에 두고 local, test, dev, prod에서 같은 값을 물려받는다. Spring Boot의 SQL 파일 자동 초기화는 끄고, 테이블 구조는 Flyway로 관리한다. local, dev, prod의 `spring.flyway.enabled`는 기본값 `true`를 사용하므로 따로 적지 않는다. test의 `false`는 자동 실행만 끄는 설정이며 Flyway를 사용하지 않는다는 뜻이 아니다.

이 문서는 환경별 실행과 데이터 준비 방법을 다룬다. Flyway 설정의 의미, SQL 파일의 역할, 새 버전 작성 방법과 기존 DB의 최초 도입 절차는 [Flyway 적용 구조와 변경 방법](flyway.md)에 정리한다.

프로필을 지정하지 않으면 local로 뜨지만(`spring.profiles.default: local`) 서버에서는 `SPRING_PROFILES_ACTIVE`로 프로필을 명시한다.

썸네일 저장 경로는 각 프로필 파일에서 지정하고 버킷, 리전, 이미지 조회 주소는 `application.yml`에 둔다.
로컬에서도 업로드를 시도하며 권한이 없어 실패하면 썸네일 없이 계속 처리한다.

썸네일 관련 테스트는 Fake(외부 서비스 대신 정해진 결과를 돌려주는 테스트용 구현)를 쓴다.
`FakeMediaExtractionConfig`의 인스타그램 저장소는 `yeogidam/instagram-thumbnails/pipeline-2026.jpg`를
반환해 업로드 성공 이후의 처리를 검증한다. 장소 사진 조회는 `null`을 반환하므로 카카오 사진 업로드를
시도하지 않고 인스타그램 썸네일을 대체 사진으로 쓰거나 썸네일 없이 처리한다.
`test` 프로필 자체가 S3 업로드를 막지는 않는다.

## 2. 로컬 실행 준비

### 2.1 `.env`

env는 노션 페이지를 참고해 작성한다. 로컬 `DB_URL`에 `localhost` 등 로컬 주소와 사용할 DB 이름을 지정한다. 예를 들어 `jdbc:mysql://localhost:3306/yeogidam`이면 `yeogidam` DB를 사용한다. DB 이름에 접미사 등의 제한은 없으며 별도 DB 이름 설정도 필요하지 않다. local 앱은 매 실행 이 DB의 업무 데이터를 비우고 샘플을 다시 넣는다.

DB가 없다면 `DB_URL`에 적은 이름으로 로컬 MySQL에 DB를 만든다. 다음은 이름이 `yeogidam`인 경우의 예시다. 테이블은 앱 시작 시 Flyway가 만든다.

```sql
CREATE DATABASE yeogidam;
```

### 2.2 로컬 실행용 데이터

로컬 앱을 실행할 때마다 다음 순서로 준비한다.

1. `LocalDatabaseResetConfiguration`이 로컬 주소인지 확인하고, `DB_URL`로 연결한 DB와 Flyway 대상이 같은지 확인한다.
2. Flyway `migrate()`로 미적용 버전만 실행한다. 빈 DB에서 처음 실행할 때는 V1부터 모든 버전을 실행한다.
3. 공용 `src/main/resources/cleanup.sql`의 TRUNCATE로 업무 데이터와 자동 증가 ID를 초기화한다. 테이블 구조와 `flyway_schema_history`는 유지한다.
4. `LocalMemberSeeder`가 회원 1, 2를 넣는다. Flyway가 완료된 뒤 `ApplicationRunner`의 실행 단계에서 `@Order(0)`으로 실행한다.
5. `LocalDataSeeder`가 `@Order(1)`로 실행되어 `db/seed/data-local.sql`, `db/seed/data-onboarding.sql` 순서로 데이터를 넣는다.

시드 SQL은 `src/main/resources/db/seed`에 있으며 Flyway가 직접 실행하는 파일은 아니다. 재시작하면 직접 추가한 로컬 데이터도 사라지고 같은 샘플 상태가 된다. 마이그레이션이 실패하면 TRUNCATE와 시드 삽입을 시작하지 않는다. 이 초기화와 시드 실행은 local에서만 사용하며, test, dev, prod 프로필이 함께 켜져 있으면 실행하지 않는다.

- `db/seed/data-local.sql`: 장소 8개, 릴스 7개, 공유 9건, 보관함 5행, 제보 1건. 정콩(회원 1)과 러키(회원 2) 시나리오이고 파일 머리 주석에 적혀 있다.
- `db/seed/data-onboarding.sql`: 군자역 디저트 캐러셀의 게시물 1개, 장소 5개, 게시물과 장소 연결 5개. local에서는 로컬 시나리오 SQL 다음에 자동 실행하며, dev와 prod에서는 온보딩 데이터가 필요할 때 이 파일을 직접 적용한다. `media_shortcode`, `kakao_place_id`를 기준으로 upsert해 재적용해도 중복되지 않는다. 장소 5개의 `kakao_place_id`는 FE 번들과 같아야 한다. 현재 SQL에는 게시물 표지와 장소 5개의 `thumbnail_key`가 들어 있으며, SQL 실행 중 이미지를 S3에 업로드하지는 않는다.
- 회원 행은 `LocalMemberSeeder`가 샘플 SQL보다 먼저 넣는다. `.env`의 `SEED_KAKAO_USER_ID_BEAN`이 회원 1, `SEED_KAKAO_USER_ID_LUCKY`가 회원 2의 카카오 회원번호다. 비워 두면 `members.provider_user_id`에 각각 `local-sample-1`, `local-sample-2`를 넣어 개발용 회원을 만든다. 이 값은 실제 카카오 회원번호가 아니며 `members.id`는 1, 2로 유지한다.
- SQL 파일은 환경변수를 못 읽으므로, 카카오 회원번호를 환경변수로 관리하려고 회원 행만 자바 클래스 `LocalMemberSeeder`로 뺐다.

로그인할 때 카카오 회원번호로 `members`를 찾는다.
`.env`의 값이 내 회원번호면 회원 1이나 2로 들어가고, 아니면 새 회원이 생겨 보관함이 비어 보인다.

회원번호를 모르면 아래 순서를 따른다.

1. `SEED_KAKAO_USER_ID_*`를 비운 채 앱을 띄우고 3절 순서대로 로그인한다.
2. `SELECT id, CAST(provider_user_id AS CHAR) FROM members;`를 실행해 방금 로그인하여 생성된 회원의 카카오 회원번호를 확인한다. `local-sample-1`, `local-sample-2`는 카카오 회원번호가 아니므로 제외한다.
3. 확인한 회원번호를 `.env`의 자기 키에 넣고 앱을 다시 띄운다.
4. 3절 순서대로 다시 로그인한다. 이번에는 회원 1이나 2로 들어가고 이후 재시작해도 같은 회원이다.

## 3. 로컬 실행과 Swagger 확인

```bash
cd Backend
./gradlew bootRun
```

IntelliJ는 실행 버튼만 누르면 된다. 기동 로그에 `falling back to 1 default profile: "local"`이 보이면 맞다.

1. 브라우저에서 인가 코드를 받는다. 로그인하면 `.../oauth/kakao/callback?code=XXXX`로 돌아오는데 404가 떠도 되니 주소창의 `code=` 값만 복사한다. 인가 코드는 한 번만 쓸 수 있다.

   ```
   https://kauth.kakao.com/oauth/authorize?client_id={KAKAO_CLIENT_ID}&redirect_uri={KAKAO_REDIRECT_URI}&response_type=code
   ```

2. Swagger(`http://localhost:8080/swagger-ui/index.html`)에서 `POST /api/v1/auth/logins/kakao`에 `{"authorizationCode": "XXXX"}`를 보내 `accessToken`을 받는다.
3. Authorize에 `accessToken`을 넣는다(30분이면 만료된다).
4. `GET /api/v1/saved-places`에서 정콩의 보관함 2건과 러키의 보관함 3건을 확인한다. 공유 히스토리는 `GET /api/v1/shares`, 각 공유의 추출 장소는 `GET /api/v1/shares/{sharedMediaId}/places`에서 확인한다.

## 4. 테스트

```bash
cd Backend
./gradlew test
```

다음은 DB를 사용하는 DAO, 서비스 통합, E2E 테스트의 공통 동작이다. Docker가 켜져 있어야 한다.

1. `MySqlContainerSupport`가 테스트용 `mysql:8.4` 컨테이너를 띄운다.
2. 공용 DB를 처음 준비할 때 Flyway의 `migrate()`를 직접 호출해 V1부터 모든 버전 SQL을 실행한다. 새 DB이므로 `baselineOnMigrate(false)`로 기존 구조의 baseline 등록 없이 테이블을 만든다.
3. 각 테스트 메서드 실행 전에 `JdbcTestSupport`, `IntegrationTestSupport`, `E2eTestSupport`의 `@Sql("/cleanup.sql")`이 로컬과 같은 `src/main/resources/cleanup.sql`을 실행한다. TRUNCATE로 업무 데이터와 자동 증가 ID를 초기화하며, 테이블 구조와 `flyway_schema_history`는 유지한다.
4. 테스트가 필요한 데이터를 넣고 검증한다. 다음 테스트에서는 3번부터 반복한다.

`application-test.yml`의 `spring.flyway.enabled: false`는 Spring Boot의 자동 실행만 끈다. 공통 지원 코드가 이미 직접 실행했으므로, 스프링 테스트 환경을 여러 번 만들어도 같은 DB에 마이그레이션을 다시 요청하지 않도록 한다. 새 컨테이너에서는 V1부터 V3까지 순서대로 실행하고, 이후 버전이 추가되면 다음 실행에 함께 적용한다.

JDBC 테스트의 정리 SQL은 `ISOLATED`로 별도 트랜잭션에서 실행하고, 테스트 본문에서 변경한 데이터는 종료 시 롤백한다. E2E는 서버 요청이 데이터를 실제 저장하므로 각 테스트 전 TRUNCATE로 정리한다. 테스트 실행 프로세스가 끝나면 컨테이너도 정리한다.

테스트 데이터는 `support/fixture/sql`의 `MemberSqlFixture` 같은 클래스나 테스트 코드의 INSERT로 준비한다. local의 회원 시드와 두 시드 SQL 파일은 자동 실행하지 않는다. DB를 사용하지 않는 단위 테스트에는 이 과정이 없다. Flyway 동작 자체를 검증하는 `FlywayIntegrationTest`는 별도의 격리 DB를 만들어 local, dev, prod 시작 동작도 확인한다.

## 5. 자주 발생하는 오류

| 증상 | 원인 | 조치 |
|---|---|---|
| `Access denied for user 'root'@'localhost'` | `.env`의 `DB_PASSWORD`가 다름 | `.env` 수정 |
| `Unknown database 'yeogidam'` | `DB_URL`에 적은 DB가 없음 | URL에 적은 이름으로 DB 생성. 예: `CREATE DATABASE yeogidam;` |
| 로컬 주소의 DB가 아니라는 초기화 오류 | `DB_URL`이 원격 주소를 가리킴 | `DB_URL`이 `localhost` 등 로컬 주소인지 확인 |
| Flyway 대상 DB가 다르다는 초기화 오류 | Flyway 스키마 설정이 접속 DB와 다름 | Flyway의 `schemas`, `default-schema`를 따로 지정했다면 `DB_URL`의 DB와 일치시키거나 해당 설정을 제거 |
| 브랜치를 바꾼 뒤 `Migration checksum mismatch`, `Unknown column`, `Detected applied migration not resolved locally` | 다른 브랜치에서 실행한 버전 SQL이 로컬 DB의 구조와 실행 기록에 남음 | 로컬 DB를 지우고 다시 만든 뒤 실행. 예: `DROP DATABASE yeogidam; CREATE DATABASE yeogidam;` |
| 테이블은 있는데 데이터가 없음 | local이 아닌 프로필로 뜸 | 기동 로그의 프로필 확인 |
| 로그인은 되는데 보관함이 빈 배열 | `.env`의 `SEED_KAKAO_USER_ID_*`가 비었거나 내 회원번호가 아님 | 2.2절 |
| 로그인이 401 `INVALID_CREDENTIAL` | 인가 코드를 두 번 씀, 또는 리다이렉트 URI 불일치 | 인가 코드 새로 받기 |
| 테스트가 전부 `ExceptionInInitializerError` | Docker 꺼짐 | Docker 실행 |

## 6. dev와 prod

### 6.1 Flyway 적용

두 프로필 모두 공통 `application.yml`의 Flyway 설정을 사용한다. 서버 시작 중 미적용 SQL을 실행하고, 그 작업이 완료된 뒤 앱 시작을 계속한다. 마이그레이션이 실패하면 앱 시작도 실패한다.

로컬의 TRUNCATE와 회원 시드, 두 시드 SQL의 자동 실행은 없다. 온보딩 데이터는 필요할 때 `db/seed/data-onboarding.sql`을 직접 적용한다. 개발 DB에 로컬 시나리오 SQL도 넣는 경우에는 참조 대상인 회원 1, 2를 먼저 준비해야 한다.

기존 DB에 처음 도입할 때의 baseline 등록과 실행 기록 확인은 [Flyway 적용 구조와 변경 방법](flyway.md)을 따른다.

### 6.2 서버 설정과 배포

- `application-dev.yml`과 `application-prod.yml`을 만들었다(2026-09-28). `spring.sql.init.mode: never`는 공통 `application.yml`에만 두어 중복을 없앴다. prod는 `springdoc.api-docs.enabled: false`, `springdoc.swagger-ui.enabled: false`로 문서를 닫는다. CloudWatch 지표 필터가 level 키로 ERROR를 세도록 둘 다 `logging.structured.format.console: logstash`로 로그를 JSON 한 줄로 찍는다.
- 배포 산출물은 태그가 아니라 Docker digest(`yeogidam/backend@sha256:...`)로 고정한다. digest로만 pull하면 로컬에서 태그가 없어 dangling으로 분류되므로, `deploy.sh`가 pull 직후 커밋 SHA 태그와 역할 태그(`candidate`)를 붙인다. 배포가 성공하면 같은 스크립트가 역할 태그를 `current`로 옮기며 기존 `current`를 `previous`로 내린다. 롤백 대상은 `previous` 태그로 찾는다(인프라 ADR-01).
- 이미지를 정리할 때는 `current`, `previous`, `candidate`가 가리키는 digest와 실행 중인 컨테이너의 이미지를 먼저 삭제 금지 목록으로 만든 뒤, `yeogidam/backend` 저장소의 나머지 이미지만 지운다. 서버 전체를 대상으로 하는 `docker image prune`은 쓰지 않으며, 보존 대상을 찾지 못하면 정리를 건너뛴다.
- 배포는 GitHub Actions self-hosted 러너가 EC2에서 직접 하고 러너 계정 `github-runner`는 `docker` 그룹에 속한다. 환경변수는 저장소에 두지 않고 각 서버의 `/opt/yeogidam/backend.env`에 넣어 두며 `deploy.sh`가 `--env-file`로 넘긴다.
- dev/prod는 `FLYWAY_USERNAME`, `FLYWAY_PASSWORD`를 별도로 등록한다. 앱은 `DB_*` 계정으로 업무 데이터를 다루고 Flyway는 전용 계정으로 이력과 구조를 관리한다. 배포 스크립트는 두 값의 누락과 공백을 기존 앱 중지 전에 검사한다. 계정 권한과 최초 적용 순서는 [Flyway 문서](flyway.md#21-서버의-앱-계정과-flyway-계정)를 따른다.
- 앱 업데이트 정책은 프로필로 나누지 않고 `application.yml` 한 곳에 리터럴로 둔다. 값을 바꿀 때는 커밋하고 배포하며 스토어 점진적 출시가 100%가 된 뒤에만 최소 지원 버전을 올린다. 설정 파일에 두면 값 변경이 PR로 남고 잘못된 값은 `PlatformPolicy` 생성자 검증이 CI에서 잡는다. 환경변수로 뺐을 때의 이득도 지금 배포 구조에서는 생기지 않는다. `--env-file`은 컨테이너를 만들 때만 읽히고 `deploy.sh`는 같은 이미지면 컨테이너를 교체하지 않아서, 서버의 값만 고치면 `Infra/scripts/restart-backend.sh`로 손배포해야 반영된다.
- **`APP_UPDATE_*` 환경변수는 yml에 리터럴로 적은 값도 덮는다.** Spring Boot의 relaxed binding이 `APP_UPDATE_ANDROID_MINIMUM_SUPPORTED_VERSION`을 `app-update.android.minimum-supported-version`으로 매핑하고, 환경변수가 설정 파일보다 우선순위가 높기 때문이다. 그래서 값을 급히 바꿔야 하면 서버 env에 넣어 덮을 수는 있지만, 이력이 남지 않으므로 비상용으로만 쓴다. 반대로 로컬 셸에 `APP_UPDATE_*`를 설정해 두면 `application-test.yml`의 E2E 픽스처가 덮여 앱 정책 테스트가 깨진다. 최소 지원 버전이 최신 버전보다 높아지면 생성자 검증이 예외를 던져 컨텍스트가 뜨지 못해 해당 테스트 클래스 전부가 실패하므로, 원인이 값 하나라는 것이 드러나지 않는다. 앱 정책 테스트가 이유 없이 깨지면 셸 환경변수를 먼저 본다.
- dev에서만 다른 버전으로 강제 업데이트 동작을 시험하려면 `application-dev.yml`에 `app-update` 블록을 넣어 커밋하고, 어떤 값으로 시험했는지는 이력에 남는다. 프로필 파일은 적어 둔 키만 덮으므로 `store-url`처럼 그대로 둘 값은 다시 적지 않는다. **최소 지원 버전만 올리면 안 된다.** 최신 버전이 `application.yml` 기본값으로 남아 최소보다 낮아지고 `PlatformPolicy` 생성자 검증이 예외를 던져 컨텍스트가 뜨지 못한다. 최소를 올릴 때는 최신도 같이 올린다. 평소에는 블록을 두지 않아 dev가 공통값을 그대로 따라가게 한다. 값을 복사해 두면 나중에 공통값을 올렸을 때 dev만 옛 값에 묶여, 정작 새 값을 먼저 확인해야 할 곳에서 확인하지 못한다.
- Dockerfile이 `SPRING_PROFILES_ACTIVE`를 받고 서버의 `/opt/yeogidam/backend.env`가 `.env`와 같은 이름의 환경변수를 넣는다([인프라 현재 상태](infra/current-state.md) 「환경 설정」).
- DB URL은 `connectionTimeZone=UTC&forceConnectionTimeZoneToSession=true&preserveInstants=true`를 쓰고 MySQL `time_zone`은 UTC다(됨). 서버 env의 `DB_URL`에 같은 파라미터가 들어 있고, 개발 Docker MySQL과 RDS 모두 `time_zone` 기본값이 UTC라 따로 맞추지 않았다. DAO가 UTC로 읽고 쓴다.
- 카카오 콘솔에 dev와 prod 리다이렉트 URI를 아직 등록하지 않았고 앱이 실제로 쓸 콜백 주소를 정하면 서버 env의 `KAKAO_REDIRECT_URI`와 함께 맞춘다([사고 기록 2026-10-01](infra/incidents/2026-10-01-dev-kakao-login-503.md)).
