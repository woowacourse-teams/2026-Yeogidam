# Flyway 적용 구조와 변경 방법

DB 구조는 `db/migration`의 버전 SQL로 관리한다. 앱을 시작하면 Flyway가 실행 기록을 확인하고 아직 적용하지 않은 버전을 순서대로 실행한다.

현재 앱에 적용할 버전 파일은 기존 운영 구조를 담은 `V1__initial_schema.sql` 하나다. `schema.sql`은 삭제했으며, #412에서 개발 서버와 운영 서버에 Flyway를 처음 적용하고 기존 DB에 baseline 1을 등록한다. `extraction_attempts`의 V2부터 필요한 구조 변경, 기존 데이터 이관과 해당 변경의 서버 배포는 #297에서 진행한다. 개발과 운영의 전용 계정 및 서버 환경변수 준비는 끝났으며, 서버 배포와 baseline 등록은 아직 하지 않았다.

적용 구조, SQL 변경 방법, 서버 적용 순서와 실패 복구를 차례로 다룬다. local, test, dev, prod의 실행 차이와 로컬 DB 준비 방법은 [실행 프로필과 로컬 환경](profiles.md)을 참고한다.

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

### 3.3 머지 전 확인

`be-dev`에 머지하면 개발 서버 배포가 바로 시작되므로(6절) PR을 머지하기 전에 아래 항목을 확인한다. 3.1절의 번호 규칙과 적용한 파일을 고치지 않는 규칙도 함께 지킨다.

**번호**

- 작업을 시작할 때와 머지 직전에 `origin/be-dev`의 버전 파일 목록을 본다.
- 내 파일의 번호는 목록에서 가장 큰 번호보다 커야 하며 작으면 7절의 오류가 난다.
- `be-dev`는 머지 전에 PR 브랜치를 최신 base로 갱신하도록 요구하므로, 갱신한 뒤에도 번호를 다시 본다.

```bash
git fetch origin be-dev
git ls-tree --name-only origin/be-dev Backend/src/main/resources/db/migration/
```

**CI가 잡는 것과 놓치는 것**

- 테스트의 `MySqlContainerSupport`가 모든 버전 파일을 읽어 실행하므로, 같은 번호의 파일이 두 개면 Flyway가 `Found more than one migration with version 2`로 멈춰 CI가 실패한다.
- 테스트 DB는 매번 빈 DB라서 V1부터 번호 순서대로 모두 실행하므로, 내 번호가 이미 머지된 번호보다 작아도 CI는 통과한다.
- 서버 데이터에서만 실패하는 SQL도 CI는 통과한다. `members.nickname`에 UNIQUE를 거는 V2는 빈 DB에서 성공했고 닉네임이 겹치는 회원이 있는 DB에서는 `Duplicate entry`로 실패했다.

**서버 데이터**

- UNIQUE 추가처럼 기존 행이 조건을 어길 수 있는 변경은 머지 전에 개발 DB와 운영 DB에서 어기는 행을 조회한다.
- 조회는 앱 서버에서 관리자 계정이나 `yeogidam_migrator`로 접속해 실행한다.

```sql
SELECT nickname, COUNT(*) FROM members GROUP BY nickname HAVING COUNT(*) > 1;
```

**파일 작성**

- 한 파일에 DDL 문장을 하나만 두고 데이터 변경은 구조 변경과 다른 파일에 둔다. 실패했을 때 남는 상태가 줄어드는 근거와 예시는 8.6절에 적었다.

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

## 6. 서버에 새 버전을 적용하는 순서

#412로 서버에 baseline 1을 등록한 뒤부터 V2 이상의 버전 SQL은 개발 서버를 먼저 거쳐 운영 서버에 적용된다. 별도 마이그레이션 명령은 없으며 배포가 새 앱 컨테이너를 시작할 때 Spring Boot가 Flyway를 실행한다.

6절부터 9절에 적은 오류 문구와 DB 상태는 2026-10-27에 확인했다. PR #430 head(`6a44f9d`)로 만든 bootJar에 예시 버전 파일을 넣고, dev 프로필과 DML 앱 계정, 2.1절과 같은 권한의 `yeogidam_migrator`로 일회용 로컬 MySQL 8.0.46에 띄웠다. bootJar에는 Flyway 12.4.0이 들어 있다. 서버와 같은 MySQL 8.4.11에서는 다시 실행하지 않았고 Docker 컨테이너와 `deploy.sh`도 실행하지 않았다. `deploy.sh`의 동작은 스크립트 코드를 기준으로 적었다.

### 6.1 개발 서버 배포

1. 작업 브랜치의 PR을 `be-dev`에 머지한다. 버전 SQL은 `Backend/src/main/resources`에 있으므로 Backend CD의 push 경로 조건(`Backend/**`에서 문서 제외)에 걸린다.
2. Backend CD가 `./gradlew check`, 이미지 빌드와 Docker Hub 발행, 개발 러너의 `Backend/scripts/deploy.sh`를 차례로 실행한다.
3. `deploy.sh`는 기존 컨테이너의 이름을 `yeogidam-backend-rollback`으로 바꿔 멈춘 뒤 새 컨테이너를 시작한다.
4. 새 컨테이너의 Spring Boot가 `yeogidam_migrator`로 Flyway를 실행하고 미적용 버전을 모두 실행한 뒤에 앱 시작을 이어 간다.
5. `deploy.sh`는 `/actuator/health/liveness`가 healthy가 될 때까지 기다린다. healthy가 되면 `yeogidam-backend-rollback`을 지우고 `current` 태그를 새 이미지로 옮기며, healthy가 되지 않으면 8.2절의 자동 롤백을 실행한다.

**배포 중 동작**

- 기존 앱은 Flyway가 실행되는 동안 멈춰 있으므로, 배포 때마다 생기는 502 시간에 마이그레이션 실행 시간이 더해진다.
- liveness 확인은 `livenessState`만 보므로 앱이 시작됐는지만 알려 준다. 바뀐 구조를 앱이 제대로 쓰는지는 6.2절에서 따로 확인한다.
- 새 컨테이너가 `BACKEND_HEALTH_TIMEOUT_SECONDS`(기본 150초) 안에 healthy가 되지 않으면 `deploy.sh`가 컨테이너를 강제로 지운다. Flyway가 제한 시간 안에 끝나지 않을 때 DB에 무엇이 남는지는 확인하지 않았으므로, 큰 테이블을 바꾸는 버전은 머지 전에 실행 시간을 따로 잰다.
- 앱 계정의 권한은 `yeogidam.*`에 걸려 있어서 `yeogidam_migrator`가 새로 만든 테이블도 앱 계정으로 읽고 쓸 수 있었다. 테이블을 추가할 때 권한을 따로 주지 않는다.

### 6.2 개발 서버에서 확인

1. GitHub Actions의 Backend CD 요약에서 `결과`가 `성공`인지 본다.
2. CloudWatch 로그 그룹 `/yeogidam/dev/backend`에서 Flyway 메시지를 찾는다. dev와 prod 로그는 JSON 한 줄이므로 `message` 값으로 찾으며, 성공하면 아래 메시지가 남는다.

   ```text
   Migrating schema `yeogidam` to version "2 - add member bio"
   Successfully applied 1 migration to schema `yeogidam`, now at version v2 (execution time 00:00.012s)
   ```

3. 앱 서버에서 관리자 계정이나 `yeogidam_migrator`로 DB에 접속하고 5절의 SQL로 이력을 본다. 새 버전 행의 `success`가 `1`이고 `installed_by`가 `yeogidam_migrator`인지 확인한다.
4. `SHOW CREATE TABLE members;`처럼 바꾼 테이블을 조회해 의도한 구조인지 확인한다.
5. 바뀐 구조를 쓰는 API를 개발 서버에서 호출한다.

### 6.3 운영 서버 배포

1. 승격 PR에 들어갈 버전 파일을 본다. 아래 명령은 `be-release`에 없고 `be-dev`에만 있는 버전 파일을 `A`로 보여 준다.

   ```bash
   git fetch origin be-dev be-release
   git diff --name-status origin/be-release origin/be-dev -- Backend/src/main/resources/db/migration
   ```

2. 운영 DB의 덤프를 받는다. `be-release`에 머지하면 운영 배포가 바로 시작되므로 승격 PR을 머지하기 전에 받는다. RDS 자동 백업(7일 보존)도 켜져 있지만 배포 직전 상태로 되돌릴 수 있도록 덤프를 따로 남긴다.

   ```bash
   mysqldump --defaults-extra-file=<접속 파일> --ssl --single-transaction --no-tablespaces --hex-blob \
     --default-character-set=utf8mb4 yeogidam > yeogidam-before-v2.sql
   ```

3. `be-dev`에서 `be-release`로 PR을 만들어 Merge Commit으로 머지한다. Backend CD는 개발 서버에서 돌린 이미지를 다시 빌드하지 않고 운영에 배포하며 운영 DB에 미적용 버전을 번호 순서대로 실행한다.
4. 6.2절과 같은 방법으로 운영을 확인한다. 로그는 `/yeogidam/prod/backend` 그룹에서 본다.
5. 확인을 마치면 서버에 남긴 덤프 파일을 지운다. 2026-10-19 data migration 때 서버에 남긴 SQL 백업이 운영 디스크 사용률을 올린 일이 [인프라 현재 상태](infra/current-state.md)의 「안 한 것」 8번에 있다.

**백업 계정과 접속**

- 백업과 복원은 관리자 계정으로 한다. `yeogidam_migrator`에는 `LOCK TABLES` 권한이 없어서 덤프를 다시 넣을 때 덤프 안의 `LOCK TABLES` 문장이 거부됐다.
- 접속 정보는 앱 서버의 권한 600 접속 파일(`[client]` 형식)에 두고 `--defaults-extra-file`로만 쓰며, 명령줄에 비밀번호를 적지 않는다. 작업이 끝나면 접속 파일을 지운다.
- 운영 RDS에 접속할 때는 `--ssl`이 필요하다([인프라 현재 상태](infra/current-state.md)).
- `--default-character-set=utf8mb4`를 빼면 한글과 이모지가 오류 없이 깨진 채 저장된다.
- 데이터를 바꾸는 버전은 `be-dev`에 머지하기 전에 같은 방법으로 개발 DB도 백업한다.

## 7. 번호가 늦게 머지된 경우

두 PR이 함께 진행되면 작은 번호가 나중에 머지될 수 있다. `V3__add_place_memo.sql`이 먼저 머지되어 개발 DB에 적용된 뒤 `V2__add_member_bio.sql`이 머지되면, 개발 서버의 새 컨테이너가 아래 오류로 시작하지 못한다.

```text
Validate failed: Migrations have failed validation
Detected resolved migration not applied to database: 2.
To ignore this migration, set -ignoreMigrationPatterns='*:ignored'. To allow executing this migration, set -outOfOrder=true.
```

**서버 상태**

- Flyway가 실행 전 검증에서 멈추므로 V2는 실행되지 않고 `flyway_schema_history`도 바뀌지 않는다.
- `deploy.sh`가 직전 컨테이너로 되돌리며 V3까지 든 직전 이미지는 경고 없이 정상으로 시작했다.

**고치는 순서**

1. 개발 DB와 운영 DB에서 아래 SQL을 실행해 V2가 어느 서버에도 기록되지 않았는지 확인한다. 결과가 없어야 한다.

   ```sql
   SELECT version, script, success FROM flyway_schema_history WHERE version = '2';
   ```

2. 새 PR에서 파일 내용은 두고 번호만 `be-dev`의 가장 큰 번호 다음으로 바꾼다. 위 예에서는 `V2__add_member_bio.sql`을 `V4__add_member_bio.sql`로 바꾼다.
3. PR을 머지하면 개발 서버는 V4만 실행한다. V1만 있는 DB에 같은 이미지를 띄우면 V3, V4를 차례로 실행했으므로, 운영도 다음 승격 때 같은 순서로 실행한다.
4. 바꾸기 전의 V2를 로컬 DB에서 실행한 개발자는 로컬 앱이 `Detected applied migration not resolved locally: 2.`로 시작하지 못한다. 로컬 DB를 지우고 다시 만들면 V1부터 다시 실행한다.

**쓰지 않는 방법**

- 오류 문구가 안내하는 `outOfOrder`는 켜지 않는다. V3가 적용된 DB에서 `spring.flyway.out-of-order`를 켜자 V2가 V3 뒤에 실행됐고 Flyway가 `outOfOrder mode is active. Migration of schema `yeogidam` may not be reproducible.` 경고를 남겼다. V1만 있는 운영 DB는 V2, V3 순서로 실행하므로 두 DB의 적용 순서가 달라진다.
- 서버에 이미 적용된 버전의 번호는 바꾸지 않는다. 개발 DB에 V2가 성공으로 기록된 상태에서 파일을 V4로 바꾸면 `Detected applied migration not resolved locally: 2.`로 시작하지 못했다.

## 8. 마이그레이션이 실패했을 때

### 8.1 서버에 남는 상태

아래 V2를 닉네임이 겹치는 회원이 있는 DB에서 실행하면 두 번째 문장이 실패한다.

```sql
ALTER TABLE members ADD COLUMN bio VARCHAR(200) NULL;
ALTER TABLE members ADD CONSTRAINT uk_members_nickname UNIQUE (nickname);
```

**DB**

- 첫 문장이 만든 `bio` 컬럼은 남는다. MySQL은 DDL 문장마다 바로 커밋하므로 Flyway가 되돌리지 못한다.
- 두 번째 문장의 UNIQUE 제약은 생기지 않는다.
- `flyway_schema_history`에 버전 2 행이 `success = 0`으로 남는다.

**로그**

```text
Migration of schema `yeogidam` to version "2 - add member bio" failed! Please restore backups and roll back database and code!
Message    : Duplicate entry '기존 회원' for key 'members.uk_members_nickname'
Location   : db/migration/V2__add_member_bio.sql (...)
Line       : 2
```

- `Line`이 실패한 문장의 줄 번호를 알려 주며 해당 줄보다 앞에 있는 문장은 적용된 채로 남는다.

**앱**

- 앱 시작이 실패한다.
- 새 컨테이너는 `--restart unless-stopped`로 실행되어 다시 시작된다. 두 번째 시작부터는 Flyway가 실행 전 검증에서 아래 오류로 멈추므로 SQL을 다시 실행하지 않는다.

```text
Detected failed migration to version 2 (add member bio).
Please remove any half-completed changes then run repair to fix the schema history.
```

파일 내용에 따라 실패 뒤 DB에 남는 것이 다르다. 네 경우 모두 `success = 0` 행은 남았다.

| 버전 파일의 내용 | 실패 뒤 DB |
|---|---|
| DDL 여러 문장 중 뒤 문장이 실패 | 앞 문장의 구조 변경이 남는다. |
| `ALTER TABLE` 한 문장에 절 여러 개, 절 하나가 실패 | 구조가 바뀌지 않는다. |
| `UPDATE` 뒤의 DDL이 실패 | `UPDATE`로 바꾼 데이터가 남는다. |
| `UPDATE`와 `INSERT`만 있고 뒤 문장이 실패 | 데이터가 모두 되돌아간다. |

### 8.2 자동 롤백

- `deploy.sh`는 새 컨테이너가 healthy가 되지 않으면 새 컨테이너를 지운다. unhealthy나 exited 상태가 되거나 `BACKEND_HEALTH_TIMEOUT_SECONDS`가 지난 경우가 해당한다.
- 새 컨테이너를 지운 뒤 `yeogidam-backend-rollback`을 원래 이름으로 되돌려 다시 시작하고 healthy가 될 때까지 최소 60초를 기다린다.
- 다시 시작한 직전 앱도 Flyway를 실행한다. 직전 이미지에는 V2 파일이 없으므로 아래 경고만 남기고 정상으로 시작했으며 서비스는 직전 코드로 돌아온다.

  ```text
  Schema `yeogidam` has a version (2) that is newer than the latest available migration (1) !
  Schema `yeogidam` contains a failed future migration to version 2 !
  ```

- Backend CD 요약에는 `결과`가 `실패`로, `롤백`이 `직전 컨테이너 복구 성공`으로 남는다.
- 자동 롤백은 앱만 되돌리며 8.1절의 `bio` 컬럼과 `success = 0` 행은 DB에 남는다.
- 남은 구조가 직전 코드와 맞지 않으면 앱이 떠도 요청이 실패한다. 기본값이 없는 `NOT NULL` 컬럼 `bio`가 남으면 `bio`를 모르는 INSERT가 `Field 'bio' doesn't have a default value`로 실패했다.
- 실패한 컨테이너는 지워지므로 `docker logs`로 볼 수 없고 로그는 CloudWatch의 `/yeogidam/dev/backend`나 `/yeogidam/prod/backend`에서 본다.
- `current` 태그가 직전 이미지에 남아 있어서 `Infra/scripts/restart-backend.sh`를 실행해도 직전 이미지가 다시 뜨므로, 새 버전을 다시 시도하는 데 쓸 수 없다.
- `success = 0` 행이 남아 있는 동안에는 다음 배포가 모두 실패한다. V2 파일을 고친 이미지도, V2를 지우고 V3로 낸 이미지도 `Detected failed migration to version 2`로 시작하지 못했다.

### 8.3 복구 순서

복구를 마칠 때까지 `be-dev`에 다른 PR을 머지하지 않는다. 머지하면 실패한 V2가 든 이미지로 다시 배포되고 같은 검증 오류로 다시 롤백된다.

1. CloudWatch 로그에서 `failed!`가 든 메시지를 찾고 `Message`, `Location`, `Line`으로 실패한 문장을 확인한다.
2. 앱 서버에서 `yeogidam_migrator`나 관리자 계정으로 DB에 접속해 이력과 바뀐 테이블을 본다.

   ```sql
   SELECT installed_rank, version, script, success FROM flyway_schema_history ORDER BY installed_rank;
   SHOW CREATE TABLE members;
   ```

3. 실패한 줄보다 앞의 문장이 남긴 변경을 되돌리며, 8.1절의 예에서는 `bio` 컬럼을 지운다. 데이터 변경이 남아 손으로 되돌리기 어려우면 8.4절의 덤프 복원을 쓴다.

   ```sql
   ALTER TABLE members DROP COLUMN bio;
   ```

4. `success = 0` 행을 지운다.

   ```sql
   DELETE FROM flyway_schema_history WHERE version = '2' AND success = 0;
   ```

5. 원인을 고쳐 다시 배포하고 6.2절의 확인을 한다. 고치는 곳은 실패한 버전이 다른 서버에서 성공했는지에 따라 다르며 아래 두 경우로 나눈다.

**3번과 4번을 실행할 때**

- 3번을 건너뛰고 4번만 하면 다음 배포에서 첫 문장이 `Duplicate column name 'bio'`로 실패하고 `success = 0` 행이 다시 생겼다.
- `yeogidam_migrator`에는 ALTER, DROP, DELETE 권한이 있어 3번과 4번을 실행할 수 있다.

**개발 서버에서 처음 실패한 경우**

- 어느 서버 DB에도 V2가 성공으로 기록되지 않았으므로 V2 파일의 내용을 고친다.
- 고친 PR을 `be-dev`에 머지하면 개발 서버가 고친 V2를 실행하며 확인에서는 성공으로 기록됐다.
- 고치기 전의 V2를 로컬에서 성공시킨 개발자는 8.5절의 체크섬 오류가 나므로 로컬 DB를 다시 만든다.

**개발 서버에서 성공하고 운영에서 실패한 경우**

- 개발 DB에는 V2가 성공으로 기록되어 있으므로, V2 파일을 고치면 개발 서버가 8.5절의 체크섬 오류로 시작하지 못한다.
- V2 파일은 두고 운영 데이터를 고친다. 8.1절의 예에서는 겹치는 닉네임을 정리한다.
- 3번과 4번을 마친 뒤 같은 이미지를 다시 배포한다. 실패한 Backend CD 실행을 Re-run하거나 `gh workflow run backend-cd.yml --ref be-release`로 실행하며, Re-run은 실패한 실행 뒤에 `be-release`에 새 커밋이 없을 때만 통과한다.
- 데이터를 고친 DB에서 같은 V2 파일이 성공했고 체크섬도 처음 기록과 같았으므로, 개발과 운영의 이력이 같게 유지된다.

### 8.4 덤프로 되돌리기

데이터를 바꾼 버전이 중간에 실패해 손으로 되돌리기 어려우면, 6.3절에서 받은 덤프를 관리자 계정으로 다시 넣는다.

```bash
mysql --defaults-extra-file=<접속 파일> --ssl --default-character-set=utf8mb4 yeogidam < yeogidam-before-v2.sql
```

- 덤프에 든 테이블과 `flyway_schema_history`가 덤프를 받은 시점으로 돌아가므로 `success = 0` 행을 따로 지우지 않아도 된다.
- 실패한 버전이 새로 만든 테이블은 덤프에 없어서 남으므로 직접 지운다.
- 덤프를 받은 뒤에 쌓인 데이터는 자동 롤백 뒤 직전 앱이 받은 요청의 데이터까지 모두 사라진다.

### 8.5 적용한 파일을 고친 경우

성공으로 기록된 파일은 주석 한 줄만 더해도 체크섬이 달라져 앱이 시작하지 못한다.

```text
Migration checksum mismatch for migration version 2
-> Applied to database : -1061568834
-> Resolved locally    : 1380865877
Either revert the changes to the migration, or run repair to update the schema history.
```

- 파일을 적용했던 내용으로 되돌리면 다시 정상으로 시작했다.
- 구조를 더 바꿔야 하면 파일을 되돌린 뒤 다음 번호의 파일을 추가한다.
- 자동 롤백한 직전 이미지에는 원래 파일이 들어 있어서 정상으로 시작한다.

### 8.6 실패를 줄이는 작성법

- 한 파일에는 DDL 문장을 하나만 둔다. 같은 테이블을 여러 번 바꿀 때는 `ALTER TABLE` 한 문장에 절로 묶으면, 실패해도 구조가 바뀌지 않아 `success = 0` 행만 지우면 된다.

  ```sql
  ALTER TABLE members
      ADD COLUMN bio VARCHAR(200) NULL,
      ADD CONSTRAINT uk_members_nickname UNIQUE (nickname);
  ```

- 데이터 변경은 구조 변경과 다른 버전 파일에 둔다. 데이터 변경만 있는 파일은 실패하면 모두 되돌아가지만 DDL 앞에 둔 데이터 변경은 DDL이 실패해도 남는다.
- 자동 롤백한 직전 앱이 새 구조에서도 돌게 만든다. 새 컬럼에 NULL을 허용하거나 기본값을 두면 새 컬럼을 모르는 INSERT도 성공했다.
- 서버 데이터가 어길 수 있는 제약은 머지 전에 어기는 행을 조회한다(3.3절).

## 9. hotfix와 버전 SQL

hotfix는 `be-release`에서 분기해 `be-release`로 머지하며 개발 서버를 거치지 않고 새로 빌드한 이미지를 운영에 바로 배포한다([인프라 ADR-05](infra/adr-05-branch-strategy.md), `Backend/scripts/resolve-source-commit.sh`). hotfix에 넣은 버전 SQL은 운영 DB에서 처음 실행된다.

`be-dev`에 운영에 아직 나가지 않은 버전 파일이 있을 때 hotfix에 버전 SQL을 넣으면 어느 번호를 써도 배포가 막힌다. 아래 표는 `be-dev`에 V2가 있고 개발 DB에 적용된 상태를 기준으로 한다.

| hotfix 번호와 이후 조치 | 결과 |
|---|---|
| hotfix도 V2를 쓴다. | hotfix를 `be-dev`에 반영하면 V2 파일이 두 개가 되어 앱이 `Found more than one migration with version 2`로 시작하지 못한다. CI도 같은 이유로 실패한다. |
| hotfix가 V3를 쓴다. | 운영에 V3가 먼저 적용되어 다음 승격 때 운영 서버가 `Detected resolved migration not applied to database: 2.`로 시작하지 못한다. |
| hotfix가 V3를 쓰고 `be-dev`의 V2를 V4로 바꾼다. | 개발 DB에 기록된 V2의 파일이 사라져 개발 서버가 `Detected applied migration not resolved locally: 2.`로 시작하지 못한다. |

**규칙**

1. hotfix에는 되도록 버전 SQL을 넣지 않는다.
2. 넣어야 한다면 먼저 6.3절 1번의 `git diff` 명령으로 `be-release`와 `be-dev`의 버전 파일을 비교한다. 결과가 비어 있으면 두 브랜치의 버전 파일이 같다.
3. 결과가 비어 있지 않으면 hotfix로 버전 SQL을 내보내지 않고 구조 변경을 `be-dev`에 넣어 6절의 순서로 승격한다.
4. 결과가 비어 있으면 `be-release`의 가장 큰 번호 다음 번호를 쓴다. 운영 배포 뒤 바로 같은 파일을 `be-dev`에 반영하고, 반영할 때까지 `be-dev`에 다른 버전 SQL을 머지하지 않는다.
5. `be-dev`에 반영할 때 파일 내용을 한 글자도 바꾸지 않는다. 내용이 다르면 다음 승격 때 운영 서버가 8.5절의 체크섬 오류로 시작하지 못한다.
6. hotfix를 `be-release`에 머지하기 전에 6.3절 2번처럼 운영 DB의 덤프를 받는다.
