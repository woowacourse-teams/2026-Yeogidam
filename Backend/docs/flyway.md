# Flyway 적용 구조와 변경 방법

DB 구조는 `db/migration`의 버전 SQL로 관리한다. 앱을 시작하면 Flyway가 실행 기록을 확인하고 아직 적용하지 않은 버전을 순서대로 실행한다.

현재 앱에 적용할 버전 파일은 기존 운영 구조를 담은 `V1__initial_schema.sql` 하나다. `schema.sql`은 삭제했으며, #412에서 개발 서버와 운영 서버에 Flyway를 처음 적용하고 기존 DB에 baseline 1을 등록한다. `extraction_attempts`의 V2부터 필요한 구조 변경, 기존 데이터 이관과 해당 변경의 서버 배포는 #297에서 진행한다. 개발과 운영의 전용 계정 및 서버 환경변수 준비는 끝났으며, 서버 배포와 baseline 등록은 아직 하지 않았다.

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

### 2.1 서버의 앱 계정과 Flyway 계정

dev와 prod는 같은 DB에 서로 다른 계정으로 연결한다.

| 용도 | 환경변수 | 적용할 권한 |
|---|---|---|
| 앱의 업무 데이터 조회와 변경 | `DB_USERNAME`, `DB_PASSWORD` | 대상 DB의 SELECT, INSERT, UPDATE, DELETE |
| Flyway 이력 관리와 구조 변경 | `FLYWAY_USERNAME`, `FLYWAY_PASSWORD` | 대상 DB의 SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES |

운영 앱 계정은 이미 DML 네 권한만 허용한다. 개발 앱 계정의 기존 구조 변경 권한은 4절의 배포 검증을 마친 뒤 축소한다.

`application-dev.yml`과 `application-prod.yml`의 `spring.flyway.user`, `spring.flyway.password`가 전용 계정을 사용한다. URL은 앱의 `DB_URL`을 사용하며 별도 Flyway URL을 지정하지 않는다. local은 기존 `DB_*` 계정으로 Flyway도 실행하므로 `FLYWAY_*`를 추가할 필요가 없다.

각 서버의 `/opt/yeogidam/backend.env`에는 다음 키를 따옴표 없이 한 줄씩 등록한다. 비밀번호는 개발과 운영에서 다르게 정하고, 실제 값은 저장소나 채팅에 남기지 않는다. 파일은 `github-runner` 소유, 권한 600으로 관리한다.

```dotenv
FLYWAY_USERNAME=yeogidam_migrator
FLYWAY_PASSWORD=<해당 환경의 전용 비밀번호>
```

전용 계정의 MySQL Host는 해당 앱 서버의 사설 IP로 제한한다. 앱 서버를 교체해 IP가 바뀌면 계정 Host도 새 연결 검증과 함께 변경해야 한다. 관리자 계정의 접근 범위와 운영 마스터 복구 방법은 별도로 결정한다.

CD가 새 앱 컨테이너를 시작하면 Spring Boot가 먼저 Flyway를 실행하고, 앱은 업무용 계정으로 서비스한다. 별도 마이그레이션 컨테이너를 실행하는 구조는 아니다. `scripts/deploy.sh`는 Docker 접근과 기존 앱 중지 전에 `FLYWAY_USERNAME`, `FLYWAY_PASSWORD`의 누락과 공백뿐인 값을 검사한다. 중복 키는 Docker와 같이 마지막 줄을 사용하고, 비밀번호를 실행하거나 로그에 출력하지 않는다. 이 검사는 실제 DB 인증과 권한까지 검증하지 않으므로 서버에서 전용 계정의 새 연결도 미리 확인한다.

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
3. 전용 계정의 접속 범위와 위 권한을 확인하고 서버의 `FLYWAY_*`를 등록한다. 저장된 값으로 새 연결과 실제 테이블 조회를 확인한다.
4. 배포할 앱을 시작한다. 기존 테이블에 실행 기록이 없으면 baseline 1을 자동 등록하고 V1 SQL은 건너뛴다. V2 이상이 있으면 이어서 적용한다.
5. `flyway_schema_history`에서 버전 1의 `BASELINE` 기록과 `installed_by`가 전용 계정인지 확인한다. 현재 V1만 포함된 상태에서는 업무 테이블과 기존 데이터를 변경하지 않는다.
6. 기존 데이터 보존과 앱의 조회 및 쓰기 동작을 확인한다. 개발 앱 계정에 남아 있는 구조 변경 권한은 이 검증 뒤 DML 네 권한으로 축소한다. 운영 앱 계정은 이미 DML만 허용한다.

별도 baseline 명령은 필요 없으며 `baseline-on-migrate`는 계속 `true`로 유지한다. 이력이 있는 DB는 미적용 버전만 실행하고, 빈 DB는 baseline 등록 없이 V1부터 실행한다. `validate-on-migrate`도 실제 테이블 구조와 V1의 일치 여부를 확인해 주는 설정은 아니다.

`be-dev`와 `be-release`는 코드가 들어오면 자동 배포된다. 위 준비를 마친 뒤 #412를 개발 서버에 먼저 배포해 baseline 1 기록과 기존 데이터 보존, 앱 동작을 확인한다. 개발 서버에서 검증한 이미지를 운영 서버에 배포해 같은 항목을 확인한다. 이후 #297을 배포할 때는 미적용 V2부터 실행한다. #297의 구조 변경과 데이터 이관은 요청과 분석 작업을 잠시 멈춘 뒤 진행한다.

### 4.1 기존 서버와 V1의 구조 비교 결과

2026-10-27 01:10:09~10 KST에 개발·운영 DB의 메타데이터를 읽기 전용으로 조회했다.
각 앱 서버의 `backend.env`에서 접속 정보를 메모리로 읽고, 해당 서버 IP로 제한한
`yeogidam_migrator` 계정으로 인증되는지 확인했다. 업무 데이터 조회나 변경, 원격 DDL,
Flyway baseline과 앱 재시작은 수행하지 않았다.

비교 기준은 현재 브랜치의 `V1__initial_schema.sql`이다. 네트워크와 공개 포트가 없는
일회용 로컬 MySQL 8.4.11에 `utf8mb4` 연결로 V1을 적용한 뒤 구조를 추출했다.
개발·운영의 실제 MySQL 버전도 모두 8.4.11이었다.

- V1 SHA-256: `c44366419f80eaa104f8251095951b8e756d0dfde1b17b90564425e59a21f52b`
- 로컬 이미지 digest: `mysql@sha256:85b9bf2e29cf836ecb8c2a15a935d4ba0c606631dff1dd79531a11983c638f2a`

| 비교 항목 | V1 기준 | 개발 | 운영 |
|---|---|---|---|
| 테이블 | 9개 | 일치 | 일치 |
| 컬럼 | 58개 | 일치 | 일치 |
| 인덱스 | 23개, 구성 컬럼 27개 | 일치 | 일치 |
| 외래키 | 10개 | 일치 | 일치 |
| CHECK | 8개 | 5개의 리터럴 문자셋 표기 차이, 판정 의미 동일 | 일치 |
| 전체 제약조건 이름·유형·적용 여부 | 35개 | 일치 | 일치 |
| DB·테이블 기본 문자셋·정렬 규칙 | `utf8mb4` / `utf8mb4_0900_ai_ci` | 일치 | 일치 |
| 문자열 컬럼별 문자셋·정렬 규칙 | V1에서 추출한 값 | 일치 | 일치 |
| `flyway_schema_history` | V1 SQL에 없음 | 없음 | 없음 |

컬럼은 순서, 자료형, 길이, NULL, 기본값, 자동 증가 속성, 생성식과 주석을 비교했다.
인덱스는 이름, 컬럼 순서, UNIQUE, 접두 길이, 정렬 방향, 유형, 가시성과 표현식을 비교했다.
외래키는 이름, 참조 테이블·컬럼과 수정·삭제 규칙을 비교했다. 테이블 유형, 엔진, 행 형식,
옵션과 주석도 일치했다. 현재 자동 증가 카운터, 행 수와 인덱스 cardinality 같은 동적 값은 제외했다.

개발에서 표기가 다른 CHECK는 모두 `media`의 다음 다섯 개다.

- `chk_media_extraction_status`
- `chk_media_failure_reason`
- `chk_media_failure_reason_only_when_failed`
- `chk_media_seeded_succeeded`
- `chk_media_source_type`

차이는 개발의 `_latin1'FAILED'`와 기준의 `_utf8mb4'FAILED'`처럼 ASCII 리터럴 앞의
문자셋 표기뿐이다. 리터럴 값과 대소문자, 연산자, 제약조건 이름과 적용 여부는 같다.
현재 CHECK는 ASCII 문자열을 동일한 정의의 컬럼과 비교하며 명시적인 `COLLATE`가 없다.
[MySQL의 정렬 규칙 우선순위](https://dev.mysql.com/doc/refman/8.4/en/charset-collation-coercibility.html)에 따라
컬럼의 정렬 규칙이 리터럴보다 우선하므로 현재 정의에서 판정 의미는 동일하다.
로컬에서도 V1 생성 연결의 문자셋만 바꿨을 때 이 표기 차이만 생기는 것을 확인했다.
NULL, 빈 문자열, 대소문자, 끝 공백, 한글과 알 수 없는 값을 포함한 486개 조합을 CHECK 8개에
대입한 3,888회 비교에서도 진릿값 차이는 없었다. 이는 모든 가능한 입력의 전수 검증은 아니다.

운영은 수집한 테이블 구조 메타데이터가 모두 일치하고, 개발은 위 표현 차이를 제외한 테이블 구조와
제약조건의 판정 의미가 일치한다. 이 차이만을 이유로 개발 CHECK를 변경할 필요는 없다.

이번 계정 권한으로는 트리거·루틴·이벤트의 전체 존재 여부와 뷰 SQL 정의를 확인하지 못한다.
특히 [트리거 메타데이터 조회에는 TRIGGER 권한이 필요하다](https://dev.mysql.com/doc/refman/8.4/en/information-schema-triggers-table.html).
기존 업무 데이터의 적합성, 백업과 복구 가능 여부, 실제 Flyway baseline 성공도 이번 비교의 검증 범위가 아니다.
메타데이터 조회는 DB 전체의 단일 시점 스냅샷을 보장하지 않으며, 배포 전 구조가 변경되면 다시 비교한다.

## 5. 실행 결과 확인

DB에서 다음 SQL로 버전과 실행 결과를 확인한다.

```sql
SELECT installed_rank, version, description, type, installed_by, installed_on, success
FROM flyway_schema_history
ORDER BY installed_rank;
```

Docker를 켠 뒤 `Backend` 폴더에서 관련 통합 테스트를 실행할 수 있다.

```bash
./gradlew test --tests com.yeogidam.global.migration.FlywayV1IntegrationTest
```

통합 테스트는 실제 프로필 설정을 읽고, dev/prod에서 DML 앱 계정과 전용 Flyway 계정으로 빈 DB의 V1 적용 및 기존 DB의 baseline과 데이터 보존을 확인한다. 앱 접속 계정과 이력 작성자도 각각 확인한다. 로컬 재시작 시 구조와 기록 보존, 데이터와 ID 초기화도 검증한다.
