# Flyway 적용 구조와 변경 방법

DB 구조는 `db/migration`의 버전 SQL로 관리한다. 앱을 시작하면 Flyway가 실행 기록을 확인하고 아직 적용하지 않은 버전을 순서대로 실행한다.

현재 앱에 적용할 버전 파일은 기존 운영 구조를 담은 `V1__initial_schema.sql` 하나다. `schema.sql`은 삭제했으며, #412에서 개발 서버와 운영 서버에 Flyway를 처음 적용하고 기존 DB에 baseline 1을 등록한다. `extraction_attempts`의 V2부터 필요한 구조 변경, 기존 데이터 이관과 해당 변경의 서버 배포는 #297에서 진행한다. 현재까지 개발 서버와 운영 DB에 Flyway를 적용하는 작업은 진행하지 않았다.

이 문서는 적용 구조와 SQL 변경 방법을 다룬다. local, test, dev, prod의 실행 차이와 로컬 DB 준비 방법은 [실행 프로필과 로컬 환경](profiles.md)을 참고한다.

## 1. SQL 파일과 실행 담당

SQL 경로는 `src/main/resources`를 기준으로 한다.

| 파일 | 역할과 실행 담당 |
|---|---|
| `db/migration/V1__initial_schema.sql` | 빈 DB에 기존 운영과 같은 테이블을 만든다. Flyway가 버전과 실행 결과를 기록한다. |
| `cleanup.sql` | 로컬과 테스트가 함께 쓰는 업무 데이터와 자동 증가 ID 초기화 SQL이다. 로컬은 `LocalDatabaseResetConfiguration`이 마이그레이션 후 실행하고, 테스트는 각 메서드 전에 `@Sql("/cleanup.sql")`로 실행한다. 테이블과 Flyway 기록은 유지한다. |
| `db/seed/data-local.sql` | 로컬 개발용 공유와 장소 등의 샘플 데이터다. `LocalDataSeeder`가 실행한다. |
| `db/seed/data-onboarding.sql` | 온보딩 게시물과 장소 데이터다. 로컬은 `LocalDataSeeder`가 실행하고, 서버에는 필요할 때 직접 적용한다. |

`LocalMemberSeeder`는 샘플 SQL이 참조하는 회원 1, 2를 먼저 넣는다. 카카오 회원번호를 환경변수에서 읽어야 하므로 회원만 Java에서 생성한다.

Flyway는 `db/migration`만 읽는다. `db/seed` 파일은 마이그레이션 이력에 등록하지 않으므로, 샘플을 바꿀 때는 시드 SQL을 수정한다. 로컬의 초기화와 삽입 순서는 [프로필 문서의 로컬 실행용 데이터](profiles.md#22-로컬-실행용-데이터)에 있다.

`cleanup.sql`도 Flyway가 읽는 파일이 아니다. `src/main/resources`에 있어도 자동 실행되지 않으며, 로컬 초기화 코드와 테스트의 `@Sql`이 명시적으로 실행한다. dev와 prod에서는 이 데이터 정리를 실행하지 않는다.

로컬 초기화 대상은 `application.yml`의 `spring.datasource.url: ${DB_URL}`로 연결한 DB다. Java 코드에 DB 이름을 고정하지 않는다. `LocalDatabaseResetConfiguration`은 로컬 주소인지 확인하고, Flyway도 같은 DB를 대상으로 할 때만 마이그레이션과 데이터 정리를 실행한다.

## 2. 공통 설정

`application.yml`에서 다음과 같이 설정한다.

```yaml
spring:
  sql:
    init:
      mode: never
  flyway:
    locations: classpath:db/migration
    baseline-on-migrate: true
    baseline-version: 1
    validate-on-migrate: true
    clean-disabled: true
```

| 설정 | 이유 |
|---|---|
| `spring.sql.init.mode: never` | Spring Boot가 별도의 초기화 SQL을 자동 실행하지 않게 한다. 테이블 구조는 Flyway가 관리한다. |
| `locations` | 버전 SQL을 읽을 위치를 명시한다. |
| `baseline-on-migrate: true`, `baseline-version: 1` | 테이블이 있지만 실행 기록이 없는 기존 DB를 V1 상태로 등록한다. |
| `validate-on-migrate: true` | 실행 기록과 SQL 파일을 비교해 이미 적용한 파일의 변경 등을 검사한다. |
| `clean-disabled: true` | 테이블과 실행 기록을 삭제하는 Flyway의 `clean()` 사용을 막는다. 로컬에서도 `clean()`은 호출하지 않는다. |

`locations`와 `validate-on-migrate`는 기본값과 같지만 동작을 알 수 있도록 적었다. `spring.flyway.enabled`의 기본값은 `true`다. test에서는 Spring Boot의 자동 실행을 끄고 공통 지원 코드가 직접 Flyway를 실행한다. 자세한 실행 시점은 [프로필 문서의 테스트](profiles.md#4-테스트)에 있다.

## 3. 앞으로 DB 구조를 바꾸는 방법

### 3.1 버전 SQL 컨벤션

파일은 `src/main/resources/db/migration`에 두고 `V{버전}__{변경_설명}.sql` 형식으로 작성한다. Flyway의 기본 파일 형식을 사용하며, 이 프로젝트에서는 번호와 설명을 아래 규칙으로 맞춘다.

| 구성 | 작성 규칙 | 예시 |
|---|---|---|
| `V` | 대문자 `V`를 사용한다. | `V1` |
| 버전 | V1부터 시작하는 정수를 사용하고, 현재 가장 큰 버전의 다음 번호를 쓴다. | `1`, `2`, `3` |
| `__` | 버전과 설명 사이에는 밑줄을 두 개 넣는다. | `V2__add_member_bio` |
| 변경 설명 | 영어 소문자를 사용하고 단어는 밑줄 한 개로 연결한다. 무엇을 바꾸는지 적는다. | `initial_schema`, `add_member_bio` |
| 확장자 | 소문자 `.sql`을 사용한다. | `V2__add_member_bio.sql` |

파일 이름 예시는 다음과 같다. V1은 현재 파일이며 V2와 V3는 작성 예시다.

```text
V1__initial_schema.sql
V2__add_member_bio.sql
V3__add_member_bio_index.sql
```

- 버전 번호는 중복되면 안 된다. 설명이 달라도 `V2__...sql` 두 개를 만들 수 없다. 여러 사람이 작업하면 병합 전에 번호 중복을 확인한다.
- 버전 숫자가 작은 순서대로 실행한다. V10은 V9 다음에 실행한다. 적용한 버전은 실행 기록이 유지되는 동안 다시 실행하지 않는다.
- 이미 적용한 파일은 내용, 이름, 버전 번호를 바꾸거나 삭제하지 않는다. 변경을 고칠 때도 다음 버전 SQL을 추가한다.
- 하나의 파일에는 설명과 관련된 변경을 묶고, 각 SQL 문장은 세미콜론(`;`)으로 끝낸다.

버전별 실행과 적용한 파일의 변경 검사 방식은 [Flyway 공식 문서](https://documentation.red-gate.com/flyway/flyway-concepts/migrations/versioned-migrations)를 참고한다.

### 3.2 변경 순서

1. 위 규칙에 맞게 다음 버전 파일을 추가하고 변경 SQL을 작성한다. 자기소개 컬럼을 추가하는 SQL 예시는 `ALTER TABLE members ADD COLUMN bio VARCHAR(200);`이다. 현재 앱에 이 컬럼이 추가된 것은 아니다.
2. 새 구조에 맞게 코드와 시드 SQL을 수정한다. 새 업무 테이블을 추가하면 로컬과 테스트가 함께 쓰는 `src/main/resources/cleanup.sql`에도 정리 대상을 추가한다.
3. 앱과 관련 테스트를 실행한다. 로컬 DB에 V1 기록이 남아 있으면 V2만 적용하고, 새 테스트 DB에서는 V1과 V2를 모두 적용한다.

로컬은 마이그레이션 후 업무 데이터를 TRUNCATE한다. 버전 SQL에서 넣은 업무 데이터도 이때 지워지므로, 매번 필요한 로컬 샘플은 시드에서 준비한다. 데이터 정리 중 오류가 나면 일부 테이블은 이미 비워졌을 수 있으며, 오류를 해결한 뒤 다시 실행한다.

## 4. 기존 DB에 처음 도입할 때

baseline은 Flyway에 "이 DB는 이미 V1 상태"라고 기록하는 일이다. 기존 운영 DB는 V1과 같은 구조를 기준으로 하므로 테이블 생성 SQL을 다시 실행하지 않는다.

1. 대상 DB의 백업을 준비하고 서버의 `DB_URL`이 적용할 DB를 가리키는지 확인한다.
2. 담당자가 실제 테이블 구조와 V1을 비교한다. baseline 등록은 두 구조를 자동으로 비교하지 않는다.
3. DB 계정에 Flyway 이력 테이블 생성과 앞으로 추가할 버전 SQL 실행에 필요한 권한이 있는지 확인한다.
4. 배포할 앱을 시작한다. 기존 테이블에 실행 기록이 없으면 baseline 1을 자동 등록하고 V1 SQL은 건너뛴다. V2 이상이 있으면 이어서 적용한다.
5. `flyway_schema_history`에서 버전 1의 `BASELINE` 기록을 확인한다. 현재 V1만 포함된 상태에서는 업무 테이블과 기존 데이터를 변경하지 않는다.

별도 baseline 명령은 필요 없으며 `baseline-on-migrate`는 계속 `true`로 유지한다. 이력이 있는 DB는 미적용 버전만 실행하고, 빈 DB는 baseline 등록 없이 V1부터 실행한다. `validate-on-migrate`도 실제 테이블 구조와 V1의 일치 여부를 확인해 주는 설정은 아니다.

`be-dev`와 `be-release`는 코드가 들어오면 자동 배포된다. 위 준비를 마친 뒤 #412를 개발 서버에 먼저 배포해 baseline 1 기록과 기존 데이터 보존, 앱 동작을 확인한다. 개발 서버에서 검증한 이미지를 운영 서버에 배포해 같은 항목을 확인한다. 이후 #297을 배포할 때는 미적용 V2부터 실행한다. #297의 구조 변경과 데이터 이관은 요청과 분석 작업을 잠시 멈춘 뒤 진행한다.

## 5. 실행 결과 확인

DB에서 다음 SQL로 버전과 실행 결과를 확인한다.

```sql
SELECT installed_rank, version, description, type, installed_on, success
FROM flyway_schema_history
ORDER BY installed_rank;
```

Docker를 켠 뒤 `Backend` 폴더에서 관련 통합 테스트를 실행할 수 있다.

```bash
./gradlew test --tests com.yeogidam.global.migration.FlywayV1IntegrationTest
```

이 테스트는 빈 DB의 V1 적용, 기존 DB의 baseline과 데이터 보존, 로컬 재시작 시 구조와 기록 보존, 데이터와 ID 초기화를 확인한다.
