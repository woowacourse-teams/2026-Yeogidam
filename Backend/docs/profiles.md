# 실행 프로필과 로컬 환경

작성일 2026-09-19. 프로필은 local, test, dev, prod 넷이다. 지금 있는 것은 local과 test이고, dev와 prod는 개발 서버(#126)와 CI/CD(#74) 때 붙인다.

## 1. 프로필

| | local | test | dev | prod |
|---|---|---|---|---|
| 용도 | 개발자 노트북 | Gradle 테스트 | 개발 서버 | 운영 |
| DB | 로컬 MySQL(`.env`) | Testcontainers MySQL 8.4 | 개발 서버 MySQL | 운영 MySQL |
| 앱 업데이트 정책(`app-update.*`) | `application.yml` 기본값(최소 1.0.0, 최신 1.1.0) | `application-test.yml`(E2E용 구간) | 기본값 | `application-prod.yml`에서 실제 스토어 값으로 덮음 |
| `schema.sql` 실행 | 기동마다 (DROP 뒤 CREATE) | 컨텍스트마다 | 안 함 | 안 함 |
| 로컬 실행용 데이터 (`data-local.sql`) | 넣음 | 안 넣음 | 안 넣음 | 안 넣음 |
| OAuth | 실제 키 | Fake | 실제 키 | 실제 키 |
| Swagger | 켬 (springdoc 기본값) | 켬 (기본값) | 켬 (기본값) | 끔 (`springdoc.*.enabled: false`, 예정) |
| 설정 파일 | `application-local.yml` | `src/test/resources/application-test.yml` | (예정) | (예정) |

`application.yml`의 `spring.sql.init.mode`는 `never`다. `schema.sql`이 `DROP TABLE`로 시작하므로 프로필 없이 서버에 올려도 테이블이 지워지지 않게 했다. local과 test만 `always`로 켠다.

프로필을 지정하지 않으면 local로 뜬다(`spring.profiles.default: local`). 서버는 `SPRING_PROFILES_ACTIVE`로 명시한다.

## 2. 로컬 실행 준비

### 2.1 `.env`

env는 노션 페이지를 참고한다.

### 2.2 로컬 실행용 데이터 (`data-local.sql`)

기동마다 `schema.sql`이 테이블을 새로 만든 뒤 `data-local.sql`이 들어간다. 재시작하면 항상 같은 상태다.

- `data-local.sql`: 장소 8개, 릴스 7개, 공유 9건, 후보 14개, 보관함 5행, 제보 1건. 정콩(회원 1)과 러키(회원 2) 시나리오이고 파일 머리 주석에 적혀 있다.
- 회원 행은 `LocalMemberSeeder`가 넣는다. `.env`의 `SEED_KAKAO_USER_ID_BEAN`이 회원 1, `SEED_KAKAO_USER_ID_LUCKY`가 회원 2다.
- 카카오 회원 번호를 환경변수로 관리하기 위해 `LocalMemberSeeder` 클래스를 생성했다. SQL 파일은 환경변수를 못 읽어서 회원만 자바로 뺐다.

로그인은 카카오 회원번호로 `members`를 찾는다. 
`.env`의 값이 내 회원번호면 회원 1이나 2로 들어가고, 아니면 새 회원이 생겨 보관함과 대기함이 비어 보인다.

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
4. API를 누른다. 정콩은 `GET /api/v1/saved-places` 2건, `GET /api/v1/place-candidates` 카드 2장이고, 러키는 보관함 3건, 대기함 카드 1장이다.

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

## 6. dev와 prod (예정)

- `application-dev.yml`, `application-prod.yml`. `spring.sql.init.mode`는 공통값 `never`. prod는 `springdoc.api-docs.enabled: false`, `springdoc.swagger-ui.enabled: false`.
- 스키마 변경은 dev에 손으로 적용한다. 운영은 컷오버 전에 Flyway를 넣는다.
- Dockerfile이 `SPRING_PROFILES_ACTIVE`를 받고, CD가 GitHub secrets를 `.env`와 같은 이름의 환경변수로 넣는다.
- DB URL의 `serverTimezone=Asia/Seoul`을 `connectionTimeZone=UTC&forceConnectionTimeZoneToSession=true&preserveInstants=true`로 바꾸고 MySQL `time_zone`도 UTC로 맞춘다. DAO가 UTC로 읽고 쓴다.
- 카카오 콘솔에 dev와 prod 리다이렉트 URI를 등록한다.
