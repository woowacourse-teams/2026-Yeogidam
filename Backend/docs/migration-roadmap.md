# Supabase → Spring 전환 로드맵 (화면 단위로 나눈 사이클)

작성일 2026-09-16, 코드 기준 갱신 2026-10-07. 근거는 작성일에 읽은 네 가지다. 백엔드 세 트리(bean-fable 217a197, be-dev 1edfa26, feat/#151 작업 트리), 운영 Supabase(hbbrgudsbvnwuylxqlta, CLI 읽기 전용)와 Edge Function 저장소(Jiihyun/yeogidam 02a90f2), 클라이언트(origin/fe-dev 13c40ef), 피그마 화면 명세 1.1.0(40화면)과 FigJam 보드.

현재 동작: 릴스 공유 후 장소를 비동기로 분석한다. 분석이 끝나면 확인된 장소를 보관함에 저장하고 대기 중인 최신 공유 이력에 연결한다. 이미 분석에 성공한 릴스를 다시 공유하면 기존 결과를 재사용해 새 공유 이력에 즉시 연결한다. 실패 이력을 재시도하면 새 공유 이력을 만들고, 재시도에 참여한 회원의 최신 공유만 완료 상태와 장소를 반영한다. 히스토리는 커서로 나눠 읽고, `GET /shares/{sharedMediaId}/places`는 `media_places`의 추출 결과를 반환한다.

## 1. 현재 상태

| 갈래 | 상태 |
|---|---|
| be-dev | 도메인 객체(#138), 소셜 로그인과 재발급과 로그아웃(#150), /api/v1 접두어와 springdoc 3.1.1 문서 인터페이스와 사이클 1 인가(#162, 2026-09-16 머지, 3b89af3)까지. 테이블은 스키마 PR(4df7ec9)로 10개. 테스트 175건(도메인, 클라이언트 단위, @JdbcTest, 통합, E2E, 인터셉터와 리졸버 단위). 첫 읽기 기능으로 `GET /saved-places`(#166)와 공유 히스토리 API를 구현했다. |
| bean-fable | ADR-02 구조(게시물과 공유 사건 분리, 추출 결과와 보관함 연결, 보관함 실체화)로 엔드포인트 11개가 Fake 어댑터 3종과 함께 H2에서 전 구간 돈다. 인증은 X-Member-Id 헤더. |
| 운영 Supabase | 테이블 12개, 파이프라인 RPC 11개(service_role 전용), Edge Function 5개. 클라이언트는 읽기를 PostgREST로 직접 하고 쓰기는 대부분 Edge Function과 RPC로 한다. 사용자 35명, 공유 요청 4,438건, 장소 3,521건, 보관 3,525건. |
| 클라이언트 | 화면 13개(연결 안 된 2개 제외). 데이터 접근은 info 도메인(프로필, 보관함, 장소별 릴스)만 Repository로 격리되어 있고 나머지(공유 접수, 상태 폴링, 히스토리, 탈퇴, 업데이트 정책)는 모듈 함수가 Supabase를 직접 부른다. 네이티브 공유 확장 2벌이 Edge Function URL을 하드코딩한다. |

## 2. 사이클을 나누는 원칙

파이프라인이 여러 기능과 엮여 보이는 이유는 파이프라인이 **쓰기 쪽**이고 화면들이 전부 그 결과를 **읽는 쪽**이기 때문이다. 둘 사이의 계약은 테이블 여덟 개(스키마)뿐이므로 스키마를 먼저 고정하고 파이프라인 자리에 Fake를 두면 화면은 파이프라인과 무관하게 한 화면씩 붙일 수 있다. bean-fable이 이미 같은 구조(포트 3개 + Fake 3개 + afterCommit 디스패치)라서 새로 설계할 것은 없다.

1. **공통 사이클과 화면 사이클을 구분한다.** 공통 사이클은 /api/v1, Swagger, 인가, 에러 계약, 페이징 규약처럼 화면과 무관한 기반 작업이고 각각 반나절에서 하루짜리다. 화면 사이클은 "피그마 화면 하나(또는 한 묶음)가 실제 HTTP로 끝까지 돈다"가 완료 조건이다.
2. **화면 사이클의 순서는 데이터가 만들어지는 순서다.** 접수(공유) → 장소 분석과 자동 저장 → 히스토리·보관함 → 상세 → 지도 → 마이. 앞 기능이 만든 행을 뒤 화면이 읽으므로 E2E 픽스처가 자연스럽게 쌓인다. 둘이 나눠 할 때는 읽기 쪽이 SQL 픽스처로 행을 심어 쓰기 쪽을 기다리지 않는다(4절).
3. **파이프라인 실체화는 화면이 다 돈 뒤에 어댑터 하나씩 한다.** 인스타그램 조회, AI 추출, 카카오 매칭, 구글 사진은 각각 포트 하나를 교체하는 일이고 스키마와 화면을 건드리지 않는다.
4. **여러 테이블을 읽을 때는 서비스가 조립한다.** DAO는 한 테이블 또는 행이 늘지 않는 단순 조인까지만 맡는다. 보관함 목록의 `saved_places ⋈ places`처럼 1:1인 관계는 DAO에서 읽고, 릴스별 추출 결과를 공유와 보관함에 연결하는 규칙은 서비스에서 처리한다(2026-09-19). 여러 행을 줄이거나 묶는 읽기 규칙은 Projection을 감싼 일급 컬렉션(예: `SavedPlaceMediaProjections.latestPerMedia()`)에 두어 DB 없이 단위 테스트하고, 한 항목의 표시값은 응답 DTO의 정적 팩토리 `from`이 계산한다(2026-09-21). 같은 릴스에서 최신 공유 한 건만 남기는 규칙처럼 결과 행이 줄어드는 처리는 일급 컬렉션에 이름을 붙이고, 조회 결과를 표시용 DTO로 바꾸는 일은 DTO의 `from`에 둔다(2026-09-23). bean-fable의 DAO 감사(dao-subquery-audit.md)가 SQL에 들어간 규칙 두 건(#5, #6)을 이미 지적했으니 옮길 때 그 권고대로 한다.
5. **be-dev에서 합의된 것은 be-dev 방식으로 통일한다.** 테이블 복수형과 TIMESTAMP(6)(2026-09-24 팀 결정, 마이크로초 단위), Instant와 주입된 Clock, 도메인당 XxxException 하나 + XxxErrorCode(noRollbackFor용 하위 예외만 예외), Fake는 test와 fake 프로필에서 @Primary, 테스트 4계층(Testcontainers MySQL). bean-fable 코드를 옮길 때 위 다섯 가지를 맞춘다.

## 3. 화면별 필요 API (v1 제안)

경로는 전부 /api/v1 아래이고 인증이 필요한 API는 Authorization: Bearer 액세스 토큰을 받는다. 상태 표기는 있음(be-dev), 이식(bean-fable에 있음), 신규다.

| 화면(피그마) | API | 응답 요지 | 상태 |
|---|---|---|---|
| P-1 로그인 | POST /auth/logins/{kakao,google,apple} | 토큰 쌍 + 회원 | 있음 |
| (세션) | POST /auth/token-refreshes, POST /auth/logouts | 회전, 폐기 | 있음 |
| P-5 마이 A, A-1 | GET /members/me | id, nickname, email, imageUrl, oauthProvider | 있음(사이클 1 완료) |
| P-5 회원탈퇴 B | DELETE /members/me | 204. 전 세션 폐기 + 회원 데이터 삭제 | 신규 |
| P-2 링크 입력 B, B-1, 공유 확장 | POST /shares {instagramUrl} | 202. 히스토리에 공유를 남기고 분석 성공 시 추출된 장소를 보관함에 자동 저장하고 원본 릴스와 연결 | 이식(POST /media) |
| P-6 히스토리 B, B-1 | GET /shares?cursorCreatedAt=&cursorId= | {sharedMedias:[{sharedMediaId, createdAt, thumbnailUrl, caption, author, extractionStatus, failureReason, sharedUrl}], nextCursor:{createdAt, id} 또는 null}. 50건씩 커서로 나눠 읽는다. 커서 없이 요청하면 최근 50건을 주고 폴링도 같은 요청을 쓴다. 커서는 이번 페이지의 마지막 공유다 | 이식. 커서 페이징 적용(#277, #217 결론) |
| P-6 성공/실패 항목 C, C-1 | GET /shares/{sharedMediaId}/places | 히스토리 목록은 공유 정보를 제공하고, 장소 목록은 `media_places`에서 별도로 읽는다. 단건 조회 GET /shares/{sharedMediaId}는 제거했다(#280) | 이식 |
| P-6 실패 상세 C-1 | POST /shares/{sharedMediaId}/extraction-retries, POST /shares/{sharedMediaId}/reports | 202 / 201 | 이식 |
| P-2 보관함 A, A-1, D, D-1 | GET /saved-places | {savedPlaces:[{savedPlaceId, placeId, name, category, landLotAddress, roadAddress, latitude, longitude, kakaoPlaceUrl, telephone, thumbnailUrl, thumbnailSource, lastSavedAt}]} lastSavedAt 내림차순. 카드용 짧은 주소는 클라이언트가 앞 두 마디로 줄인다 | 이식 + lastSavedAt 추가(#166 PR 중) |
| P-2 보관함 편집 D-1 | DELETE /saved-places?savedPlaceIds=11,12 | 204. 한 트랜잭션으로 다건 삭제, 멱등 | 이식 |
| P-2 검색 C, C-1, C-2 | (클라이언트 메모리 필터. 검색 기록은 단말 저장) | 서버 API 없음. 페이징을 넣게 되면 ?query= 추가 | 결정 |
| P-3 지도 전부 | GET /saved-places (좌표 포함 전량), GET /saved-places/{savedPlaceId}/media (시트의 이미지 띠) | 지도 범위와 검색어 필터는 클라이언트 | 이식 |
| P-4 장소 상세 전부 | GET /saved-places/{savedPlaceId}, GET /saved-places/{savedPlaceId}/media, DELETE /saved-places?savedPlaceIds= | 장소 정보(목록 항목과 같은 모양) / 관련 공유 {media:[{sharedMediaId, thumbnailUrl, author, caption, sharedUrl, createdAt}]} | 상세만 신규 |
| 강제 업데이트 모달, 업데이트 권고 안내(1.2.0 앱부터) | GET /app-update-policies?platform&appVersion | {updateRequired, updateRecommended, minimumSupportedVersion, latestVersion, storeUrl}, 인증 없음. 비교는 서버가 한다 | 신규(#170 진행 중) |

공통 계약도 있다. 에러 응답은 be-dev의 {message, errorCode}이고 클라이언트가 쓰던 retryable, requestId는 뺀다. 보관함 항목은 `savedPlaceId`(saved_places.id)로 가리킨다(2026-09-22 결정). 목록이 그 값을 내리고 삭제와 관련 릴스가 경로 변수로 받는다. 주소 필드 이름은 DB 컬럼을 따라 landLotAddress(지번), roadAddress(도로명)이고 카드용 짧은 주소는 서버가 내리지 않는다(2026-09-21, #179 리뷰. 클라이언트 inBoxScreen의 placeAddress가 이미 앞 두 마디로 줄이므로 같은 함수를 쓴다). 현재 처리 상태는 EXTRACTING, SUCCEEDED, FAILED다. 폴링은 히스토리 목록 3초 하나로 줄이고 단건 폴링은 없앴다. 시각은 ISO-8601 UTC(Instant)다.

2026-10-06 저장 흐름을 자동 저장으로 정리했다. 추출에 성공한 장소를 `saved_places`에 회원·장소 기준으로 upsert하고, `shared_media_saved_places`에 공유 연결을 추가한다. 재공유 시에도 기존 추출 결과를 새 공유 이력에 연결한다.

## 4. 두 단계 계획 (2026-09-16 팀 결정)

2026-09-16 팀 결정으로 3일 병렬 계획(빈 쓰기, 러키 읽기)을 두 단계로 바꾼다. 읽기 API와 회원 탈퇴는 비교적 단순하므로 task로 나눠 둘이 먼저 끝내고, 남은 일정에는 쓰기 모델(접수, 파이프라인, 추출 장소 자동 저장, 재시도, 제보)을 도메인 모델링(#138) 때처럼 각자 구현해 와서 합친다. 작업 방식은 각자 브랜치에서 만들고 PR을 교차 리뷰한 뒤 be-dev에 머지하는 것으로 같다.

```
PR 0 (수 오전, 공동)  →  1단계 (수 ~ 금, 3일)              →  2단계 (다음 주 월 ~, 합치는 날은 정한다)   →  그 다음
스키마 8개, 계약 확정       읽기 API 8개 + 회원 탈퇴를            쓰기 모델을 각자 전부 구현하고               어댑터 실체화
                         A, B로 나눠 둘이 끝낸다               같은 왕복 E2E를 통과시킨 뒤 비교해 합친다      (포트 하나씩)
```

### 4.1 PR 0 (수 오전, 공동)

정오 전에 머지한다. 내용은 스키마와 결정뿐이며 코드는 넣지 않는다.

1. (2026-09-16 작성, 커밋 4df7ec9, be-dev 머지) `schema.sql`에 핵심 테이블 8개를 추가했다. 파일은 `DROP TABLE IF EXISTS` 뒤 `CREATE TABLE`로 기동마다 새로 만들고(로컬 실행용 데이터는 `data-local.sql`로), 시각은 `TIMESTAMP(6)`, 제약 이름은 `uk_<테이블>_<컬럼>`, `fk_<테이블>_<참조>`, `chk_<테이블>_<컬럼>`으로 통일했다. 현재 사용되는 상태 어휘(`extraction_status`, `source_type`, `failure_reason`)는 CHECK로 막고, `failure_reason`은 FAILED일 때만 들어가는 CHECK를 하나 더 두었다. `shared_media.member_id`, `saved_places.member_id`와 그 아래 자식 FK는 `ON DELETE CASCADE`라 회원 탈퇴가 세션 폐기 + `members` 한 행 삭제로 끝난다. `application.yml`의 기본은 `spring.sql.init.mode: never`이고 `local`, `test` 프로필만 `always`다(2026-09-19 프로필 분리, docs/profiles.md). 로컬 실행용 데이터는 `data-local.sql`에 두어 `local` 프로필의 `data-locations`에서만 읽고, 회원 행은 `LocalMemberSeeder`가 `.env`의 카카오 id로 넣는다. bean-fable의 이름은 이렇게 옮겼다.

| bean-fable | be-dev | 비고 |
|---|---|---|
| instagram_media | media | 게시물. media_shortcode UNIQUE, caption(TEXT), thumbnail_key(2048), author, extraction_status, failure_reason, extraction_version, source_type(EXTRACTED, SEEDED) |
| media_share | shared_media | 공유 사건. member_id, media_id, shared_url, created_at |
| media_place | media_places | 추출 사실. media_id, place_id. position은 뺐다 |
| share_place | place_candidates | 미사용 레거시 테이블. 현재 애플리케이션 흐름에서는 읽거나 쓰지 않으며 별도 스키마 정리 대상으로 둔다 |
| place | places | 전역 장소. kakao_place_id UNIQUE, name, category, land_lot_address, road_address, 좌표, kakao_place_url, telephone, 썸네일 3열 |
| saved_place | saved_places | 보관함. (member_id, place_id) UNIQUE, last_saved_at. first_saved_at은 뺐다 |
| saved_place_share | shared_media_saved_places | 어느 공유에서 저장했나. (saved_place_id, shared_media_id) UNIQUE |
| media_share_report | shared_media_reports | 제보. shared_media_id UNIQUE(공유 건당 한 번) |

2. `cleanup.sql`에 위 8개 TRUNCATE를 추가했다.
3. 남은 결정 1, 3, 4를 이 PR 설명에 적어 확정한다. 자원 이름은 `/shares`, 게시물 테이블은 `media`, 응답 DTO는 정적 팩토리 `from`으로 조립한다(2026-09-21 변경, 아래 남은 결정 4).
4. 회원 탈퇴가 1단계에 들어가므로 남은 결정 5도 여기서 정한다. 우리 DB 삭제만("전 세션 폐기 + members와 딸린 행 삭제")으로 갈지, 카카오 unlink(admin key와 저장된 provider id로 가능)까지 넣을지 둘 중 하나다. 구글과 애플 revoke는 제공자 토큰이 필요해 이번 3일에는 들어가지 않는다.
5. A의 관련 릴스 응답과 B의 히스토리 목록 응답에 같이 들어가는 "공유 한 건"의 필드 이름을 PR 설명에 적어 맞춘다. sharedMediaId, createdAt, thumbnailUrl, caption, author, sharedUrl, extractionStatus다. 공용 DTO는 만들지 않으므로 클래스는 각자 두고 필드 이름만 같게 한다.

### 4.2 1단계: 읽기 API와 회원 탈퇴 (수 ~ 금, 3일)

자원 단위로 task를 나눈다. 한 task를 맡은 사람이 그 자원의 조회 DAO, 서비스, 컨트롤러와 문서 인터페이스, 응답 DTO, 테스트(`@JdbcTest`, E2E)를 통째로 만든다. 읽기 task는 쓰기 API가 아직 없으므로 SQL fixture(`support/fixture/sql`의 `MemberSqlFixture`, `PlaceSqlFixture`, `SavedPlaceSqlFixture` 같은 정적 메서드)로 given에서 행을 넣어 검증하고, 같은 fixture를 2단계의 E2E가 다시 쓴다. 로그인은 `E2eTestSupport.loginAsKakao`를 그대로 쓴다.

A와 B로 나눈다(2026-09-16 확정). A는 정콩(빈), B는 러키가 맡는다. 자원 기준으로 갈려 두 사람이 같은 파일을 만질 일이 없다.

2026-09-20 기준 진행 상황은 다음과 같다. 사이클 1 인가(#162)와 PR 0 스키마(4df7ec9)가 be-dev에 있고, 코드 규칙(getter 체이닝 한 줄, `ResponseEntity.ok()` 뒤 개행, DAO SQL은 메서드 안 텍스트 블록, 응답 DTO 부생성자)은 러키에게 전달했다. 이슈는 A가 #166~#170, B가 #164부터이고 브랜치는 이슈 번호로 `feat/#번호`다. A는 #166 보관함 목록이 PR #179로 머지됐고(2026-09-21), #168 삭제가 PR #197, #169 관련 릴스가 #197 위에 쌓은 PR #200(스택 #197 → #200), #170 앱 정책이 PR #192이고, B는 히스토리 목록과 공유 API를 맡아 서로 교차 리뷰한다. PR 알림 Discord 워크플로(#186, PR #188)는 머지됐다. #167 장소 상세는 클라이언트가 목록 항목을 그대로 넘겨 써서 필요 없을 가능성이 커 러키 확인 중이다.

| 묶음 | task | API | 만드는 것 | 크기 |
|---|---|---|---|---|
| A | 보관함 전체 조회 | `GET /saved-places` | (#179 머지, 2026-09-21) `SavedPlaceDao.findAllByMember`(saved_places ⋈ places, last_saved_at 정렬)와 `SavedPlaceProjection`, `SavedPlaceResponse.from`, `SavedPlaceResponses.from`(정적 팩토리), `SavedPlaceService`, `SavedPlaceController` + `SavedPlaceApiDocs` | 0.5일 |
| A | 보관함 장소 상세 조회 | `GET /saved-places/{savedPlaceId}` | (#167, 러키 확인 중) 클라이언트 `PlaceDetailScreen`이 목록 항목을 props로 받아 쓰고 릴스만 따로 조회하므로 필요 없을 가능성이 크다. 확정되면 이 행을 뺀다 | 0.25일 |
| A | 보관함 장소 삭제 | `DELETE /saved-places?savedPlaceIds=` | (#197 머지, 2026-09-22) `SavedPlaceDao.deleteByMemberAndIds`가 `member_id`와 `id IN (…)` 한 문장으로 지운다. 이미 지웠거나 남의 항목이 섞여 있어도 결과가 같아 멱등 204다(2026-09-22 결정). 저장 항목과 공유 연결은 FK CASCADE로 함께 지워지고, 추출 결과·공유 이력·장소 정보는 남는다 | 0.25일 |
| A | 장소 관련 릴스 조회 | `GET /saved-places/{savedPlaceId}/media` | (#200 머지, 2026-09-22) `SavedPlaceDao.existsByMemberAndId`(아니면 404)와 `findMediaBySavedPlace`(연결 ⋈ shared_media ⋈ media). "릴스당 최신 공유 한 건"은 Projection 일급 컬렉션 `SavedPlaceMediaProjections.latestPerMedia()`가 맡고 DAO는 정렬 없이 읽는다. 필드는 sharedMediaId, sharedAt, thumbnailUrl, caption, author, sharedUrl | 0.5일 |
| A | 앱 업데이트 | `GET /app-update-policies?platform&appVersion` | 설정값 플랫폼당 3개(minimum-supported-version, latest-version, store-url)를 `application.yml`에서 읽는 엔드포인트. `AppVersion` 값 객체가 비교. 인증 없음(`AuthenticationConfig` exclude 추가) | 0.3일 |
| B | 히스토리와 추출 장소 조회 | `GET /shares`, `GET /shares/{sharedMediaId}/places` | 커서 페이징이 적용된 히스토리 목록과 `media_places`의 추출 결과를 반환한다. | 0.75일 |
| B | 히스토리 항목 조회 | ~~`GET /shares/{sharedMediaId}`~~ | 구현했다가 #217에서 단건 폴링을 없애며 지웠다(#231). 상태는 히스토리 목록 폴링으로 본다 | 0.5일 |
| B | 회원 탈퇴 | `DELETE /members/me` | `MemberService.deleteMember`: 전 세션 폐기 + members 삭제(FK CASCADE). 탈퇴 뒤 같은 토큰이 401인지 E2E. 범위는 PR 0에서 정한다 | 0.5일 |

A가 약 1.7일, B가 약 2.25일로 합쳐 4인일 안팎이다. 6인일 중 남는 2인일은 PR 0, 처음 만지는 테이블의 SQL 픽스처, 교차 리뷰와 rebase에 쓰인다. B가 반나절 무겁고 정책이 걸린 탈퇴를 안고 있으니 A가 먼저 끝나면 "공유 한 건" 필드 맞추기 확인이나 카카오 unlink를 받아 간다. 금요일 오후에는 두 PR이 be-dev에 들어간 상태에서 Swagger를 같이 열어 필드가 맞는지 확인하고 2단계 왕복 E2E 시나리오 초안을 잡는다.

1단계 규칙은 다음과 같다.

| 대상 | 규칙 |
|---|---|
| `schema.sql`, `cleanup.sql` | PR 0 이후의 스키마 변경은 다른 작업을 섞지 않은 단독 소형 PR로만 한다 |
| 컨트롤러와 문서 인터페이스 | 자원마다 파일이 따로다. `/shares`의 GET은 1단계에서 B가 만들고 POST는 2단계에서 각자 추가한다 |
| DTO | 응답 DTO는 만든 사람이 소유한다. 공용 DTO를 만들지 않는다. 장소 목록 항목과 장소 상세처럼 모양이 같은 곳은 같은 묶음 안에서만 공유하고, A와 B에 같이 나오는 "공유 한 건"은 PR 0에서 맞춘 필드 이름을 쓴다 |
| `E2eTestSupport` | 건드리지 않는다. DB 행 픽스처는 `support/fixture/sql`의 `XxxSqlFixture`(final 클래스, `insertXxx(jdbcTemplate, id, …)` 정적 메서드, 텍스트 블록 INSERT)로 두고 DAO 테스트와 E2E가 given에서 필요한 행만 직접 넣는다(2026-09-21 결정, `src/test/resources`의 `*.sql` 픽스처 파일과 `@Sql` 심기는 폐기, `cleanup.sql`만 남김). 같은 given이 반복되면 테스트 클래스의 private 메서드로 뺀다. E2E의 회원은 `loginAsKakao`가 만들고 `LoginResult.memberId()`를 fixture에 넘긴다. A는 members, places, saved_places(+media, shared_media, shared_media_saved_places), B는 media, shared_media, media_places fixture를 각자 만들고 겹치면 2단계에서 하나로 합친다 |
| 브랜치와 리뷰 | 이슈 번호별 `feat/#번호`(예: `feat/#141`)에서 작업하고 PR은 서로 교차 리뷰한다. 상대 PR이 머지되면 그날 퇴근 전에 be-dev에 rebase한다. 같은 자원의 후속 PR은 앞 PR 브랜치를 base로 쌓고 PR을 만들 때 "Start a pull request stack"을 켠다(#179 → #197 → #200). 앞 PR이 머지되면 GitHub가 위 PR을 be-dev 위로 다시 얹고 base를 바꾸는데, 충돌이 있으면 서버가 못 하므로 `git rebase --onto origin/be-dev <앞 브랜치> <내 브랜치>`로 로컬에서 풀고 force push한다. PR을 올리거나 리뷰와 댓글이 달리면 Discord 워크플로(#188)가 BE 채널로 알리고, 리뷰 기한은 제출 다음날 23:59다 |
| 완료 조건 | 표의 API가 Swagger에 보이고 E2E가 통과하며 be-dev에 머지되어 있다 |

### 4.3 2단계: 쓰기 모델을 각자 구현해 와서 합친다 (다음 주 월 ~, 합치는 날은 정한다)

두 사람이 각각 아래 범위를 전부 만든다. 1단계에서 머지된 읽기 API 위에서 동작해야 한다.

1. **파이프라인 골격.** 포트 3개(`InstagramContentReader`, `PlaceNameExtractor`, `PlaceSearcher`)와 Fake 3개(test, fake 프로필 `@Primary`), `ExtractionProcess`, `ExtractionResultRecorder`, `ExtractionPipeline`(`@Async`, 커밋 후 디스패치), `AsyncConfig`, `MediaDao`, `MediaPlaceDao`, `SavedPlaceDao`, `PlaceDao`(kakao_place_id로 get-or-create)를 둔다. 추출 사실은 `media_places`에 기록하고 성공한 장소는 보관함과 공유 이력에 연결한다.
2. **접수.** `POST /shares`(`ShareService.createShare`: 회원 확인, URL 파싱, 게시물 find-or-create, 공유 삽입, 추출 성공본이면 장소를 보관함에 저장하고 공유와 연결, 실패본이면 재추출 선점, 커밋 후 디스패치), `SharedMediaDao`, `ShareController`의 POST, `ExtractionRecoveryRunner`.
3. **재시도와 제보.** 실패한 추출은 `POST /shares/{sharedMediaId}/extraction-retries`로 다시 시도하고, 실패 제보는 `POST /shares/{sharedMediaId}/reports`로 접수한다. 두 API는 장소 저장과 별도 흐름이다.

각자 구현에 들어가기 전에 월요일 오전에 같이 맞춘다. 왕복 E2E 시나리오 초안은 금요일 오후에 잡아 둔다.

- **왕복 E2E 하나를 같이 쓴다.** 접수 -> Fake 완료(awaitility) -> 보관함 및 관련 릴스 조회 -> 같은 릴스 재접수 -> 보관함(행은 늘지 않고 `last_saved_at` 갱신) -> 새 공유 이력과 장소 연결 확인 -> 히스토리(공유 2건). 저장 직후 각 장소의 보관함 항목과 공유 연결이 있는지 확인한다. 조회는 1단계 API를 그대로 쓰므로 두 구현은 이 E2E를 똑같이 통과해야 하고, 합칠 때 동작 비교는 이 E2E가 대신한다.
- **재공유는 추출 결과를 재사용한다(2026-09-20 결정).** 같은 릴스를 다시 공유하면 새 히스토리 행을 만들고, 추출이 이미 성공했다면 결과 장소를 새 공유에 즉시 연결한다. 추출 중이라면 완료 시 회원별 최신 공유에 장소를 연결한다. `saved_places`는 `(member_id, place_id)` 유니크 키로 보관함 행을 유지하고 `last_saved_at`을 갱신하며, `shared_media_saved_places`는 공유별 연결을 기록한다.
- **스키마는 PR 0 그대로 쓴다.** 바꿔야 하면 단독 PR로 be-dev에 먼저 넣고 둘 다 rebase한다.
- **1단계 코드는 고치지 않는다.** 읽기 DAO, 읽기 서비스, GET 컨트롤러에 손댈 일이 생기면 별도 PR로 낸다. `ShareController`의 POST는 각자 브랜치에서 추가하고 합칠 때 하나만 남긴다.
- **브랜치는 이슈 번호별 `feat/#번호`다.** 2단계는 같은 일을 두 사람이 따로 만드니 이슈를 각자 하나씩 파서 번호로 구분한다. 구현 중에 서로 코드를 보지 않을지, 중간 공유를 할지는 도메인 모델링 때 방식으로 맞춘다.

합치는 방식은 도메인 모델링 때와 같게 한다.

- 합치는 날 각자 PR을 draft로 올리고 같은 E2E가 통과하는지 먼저 확인한다.
- 비교 기준은 여섯 가지다. 규칙이 있는 자리(도메인 객체에 있는가, 서비스로 새는가), 트랜잭션 경계(접수가 한 트랜잭션이고 디스패치는 커밋 뒤인가), 동시성 방어(재추출 선점과 상태 전이가 조건부 UPDATE인가), 테스트 4계층(도메인, `@JdbcTest`, 서비스 통합, E2E)이 전략대로 붙었는가, 포트 경계가 어댑터 교체를 막지 않는가, 코드 컨벤션.
- 한쪽을 기준으로 정하고 다른 쪽의 나은 부분을 옮기는 PR을 만든 뒤 be-dev에 머지한다.
- 합치는 날은 정해야 한다(남은 결정 13). 각자 3일 분량이라 월, 화, 수를 쓰면 다음 주 목요일(09-24)이 후보다.

### 4.4 그 다음: 어댑터 실체화

합친 쓰기 모델 위에서 포트 하나씩 교체한다(5절 사이클 8~11). 포트마다 task 하나라 나눠 맡기 좋고 읽기 쪽 파일과 부딪히지 않는다. 썸네일 저장소는 S3로 가기로 했고(남은 결정 8), 장소 매칭은 사이클 9와 10 메모의 AI 폴백 설계(검토 중)로 간다. 순서는 9 AI 추출 → 10 카카오 매칭 → 8 인스타그램 조회 → 11 사진 재호스팅을 권하고, 8은 차단 위험이 있어 시간 상자를 두고 안 되면 Fake를 유지한다. 회원 탈퇴의 제공자 unlink(남은 결정 5)와 클라이언트 전환 준비(사이클 13)도 이 시기에 같은 방식으로 나눈다.

## 5. 전체 로드맵 (사이클 단위)

| # | 사이클 | 종류 | 화면 | 만드는 것 | 완료 조건 |
|---|---|---|---|---|---|
| 0 | 인증, /api/v1, Swagger | 공통 | 로그인 | (완료) #150, 64ff616, a1d4721 | 커밋 |
| 1 | 인가 기초 작업 | 공통 | 마이 A, A-1 | (완료 2026-09-16, #162 머지) 액세스 토큰 인터셉터, @LoginMember 리졸버, GET /members/me, 401 계약(AUTH401_004), E2E 로그인 헬퍼 | 토큰 없이 401, 있으면 내 정보 |
| 2 | 스키마 계약과 접수 기본 흐름 | 화면 | 링크 입력 B, B-1 | bean-fable 테이블 8개를 be-dev 규칙으로 이식, POST /shares, Fake 3종(fake 프로필), afterCommit 디스패치, GET /shares/{sharedMediaId}(#231에서 삭제) | 링크를 보내면 Fake가 돌아 SUCCEEDED 상세가 나온다 (awaitility) |
| 3 | 히스토리 | 화면 | 히스토리 B, B-1, C, C-1 | GET /shares(커서 페이징), extraction-retries, reports | 실패 건 재시도가 EXTRACTING으로 돌아간다 |
| 4 | 추출 장소 자동 저장 | 화면 | 공유 접수, 보관함 | 추출 성공 시 확인된 장소를 `saved_places`에 upsert하고 `shared_media_saved_places`로 공유와 연결 | 같은 장소는 한 행으로 유지되고 공유별 연결을 조회할 수 있다 |
| 5 | 보관함과 장소 상세 | 화면 | 보관함 A, A-1, D, D-1, 장소 상세 전부 | GET /saved-places(lastSavedAt), GET /saved-places/{savedPlaceId}, /media, DELETE | 삭제해도 추출 결과와 공유 이력은 남는다 |
| 6 | 지도와 검색 | 화면 | 지도 전부, 검색 C | 좌표 포함 확인, 시트 이미지 띠(/media 재사용), 검색은 클라이언트 필터로 결정 | 핀 = saved_places 행 |
| 7 | 회원 탈퇴와 앱 정책 | 화면 | 회원탈퇴 B, 강제 업데이트 모달 | DELETE /members/me, GET /app-update-policies(설정값, 강제 + 권고 두 단계) | 탈퇴 후 토큰 전부 401 |
| 8 | 인스타그램 조회 어댑터 | 어댑터 | (없음) | HTML meta 파싱(Edge Function instagram.ts 이식), 실패 사유 CONTENT_UNAVAILABLE, 썸네일 저장소 포트(S3)와 재호스팅 | 실제 릴스 링크로 캡션과 썸네일이 들어온다 |
| 9 | AI 추출 어댑터 | 어댑터 | (없음) | Gemini 호출, 프롬프트와 JSON 스키마 이식, 타임아웃과 키 폴백(구현 백로그 3) | 캡션에서 장소 검색 단서가 나온다 |
| 10 | 카카오 매칭 어댑터 | 어댑터 | (없음) | 키워드 검색 + 주소 좌표 + AI 판정 루프(place_resolution.ts 이식), 매칭 실패 진단은 로그 | 확인된 장소가 `places`와 `media_places`에 저장된다 |
| 11 | 장소 사진 저장 | 어댑터 | (없음) | 카카오 장소 페이지 `og:image`를 S3에 저장하고 객체 키를 보관. 없거나 해상도가 낮으면 해당 인스타그램 썸네일 키를 폴백으로 사용. Google Places API와 월 사용량 상한은 사용하지 않음 | 장소와 함께 S3 썸네일 키가 저장된다 |
| 12 | 운영 장애 대비 | 공통 | (없음) | 처리 중 고착 인수(stale 15분), 기동 복구(있음), 관측 로그, 알림(선택). 구현 백로그 2 | 비정상 종료 뒤에도 EXTRACTING이 남지 않는다 |
| 13 | 클라이언트 전환 | 전환 | 전부 | 인증 SDK(제공자 인가 코드 → /auth/logins), 데이터 어댑터 교체, 네이티브 공유 2벌, 토큰 저장 | Supabase 호출 0건 |
| 14 | 데이터 이관 | 전환 | (없음) | supabase-migration-parity.md 매핑으로 1회 이관 스크립트, 검증 쿼리 | 사용자 35명 보관함 개수 일치 |
| 15 | 컷오버 | 전환 | (없음) | 운영 배포, 1.2.0 앱 점진적 출시 100% 확인, Supabase 환경변수의 최소 버전을 올려 1.1.0 차단, Supabase 읽기 전용 → 종료 | 앱스토어 새 버전 |

사이클 2부터 7까지는 4절의 두 단계 계획으로 진행한다. 1단계가 사이클 3, 4, 5, 6의 읽기 부분과 사이클 7이고, 2단계가 사이클 2, 3, 4의 쓰기 부분이다. 사이클 1부터 7까지가 끝나면 모든 화면이 Fake 파이프라인으로 실제 HTTP에서 돌고 그 시점부터 클라이언트 전환(13)을 병행할 수 있다. 어댑터 사이클(8~11)은 화면과 독립이라 페어가 나눠 맡기 좋다.

### 사이클별 메모

**1 인가 기초 작업.** (2026-09-16 완료) 구조는 spring-roomescape-waiting의 auth 패키지를 따랐다. LoginCheckInterceptor가 /api/** 중 /api/v1/auth/**를 뺀 경로에서 Bearer 토큰을 검증하고, LoginMemberArgumentResolver가 @LoginMember Long에 회원 식별자를 넣으며, 토큰 없음은 AUTH401_004, 깨지거나 만료된 토큰은 AUTH401_001이다. E2eTestSupport에 "로그인해서 액세스 토큰을 얻는" 헬퍼를 두면 이후 모든 화면 E2E가 같은 헬퍼를 쓴다. 액세스 토큰 만료 30분은 공유 확장이 같은 토큰을 쓰므로 사이클 13에서 다시 본다.

**2 스키마 계약과 접수 기본 흐름.** 사이클 2가 가장 크고 여기서 정하는 것이 이후 전부의 계약이다. bean-fable schema.sql의 instagram_media, media_share, media_place, place, saved_place, saved_place_share, media_share_report를 media, shared_media, media_places, places, saved_places, shared_media_saved_places, shared_media_reports로 옮겼다(4.1). 시각은 TIMESTAMP(6), 기동마다 DROP 뒤 CREATE다. 접수 서비스(`ShareService.createShare`, 4.3)는 회원 확인, URL 파싱, 게시물 find-or-create, 공유 삽입, 추출 성공 장소의 자동 저장, 실패 상태면 재추출 선점, 커밋 후 디스패치까지 하나의 트랜잭션이다. 접수 멱등성 구현은 6.1 백로그 1에 둔다. 테스트는 도메인(이미 있음), @JdbcTest(DAO), 서비스 통합, E2E(awaitility로 Fake 완료 대기) 네 겹이다.

**3 히스토리.** 목록은 `created_at DESC`, `shared_media.id DESC` 순서로 커서 페이징한다. 첫 페이지 요청은 폴링에도 쓰고, 다음 페이지 요청에는 응답의 `nextCursor`를 전달한다. 재시도는 FAILED에서만 허용하고 DB 조건부 UPDATE가 경쟁을 막는다.

**4 추출 장소 자동 저장.** 추출 성공 시 장소 정보를 `places`와 `media_places`에 저장하고, 확인된 장소를 회원의 보관함에 upsert한다. 공유별 연결은 `shared_media_saved_places`에 기록한다. 이미 성공한 미디어를 다시 공유하면 새 공유 이력에 장소를 즉시 연결한다. 보관함에서 항목을 삭제하면 해당 보관함 행과 공유 연결을 지우며 원본 추출 결과와 공유 이력은 유지한다.

**5 보관함과 장소 상세.** 보관함 응답에 lastSavedAt을 넣어 정렬 근거를 준다(client-impact-report 남은 확인 2). 장소 상세는 목록 항목과 같은 모양이라 DTO를 공유한다. 관련 릴스 목록의 "릴스당 최신 공유 한 건" 규칙은 SQL 대신 Projection 일급 컬렉션 `SavedPlaceMediaProjections`가 맡는다(#169). 지도 시트는 장소를 고르면 P-4와 같은 `PlaceDetailContent`를 시트 안에 그리므로 같은 API를 쓴다.

**6 지도와 검색.** 지도는 보관함 목록을 좌표까지 그대로 쓰고 범위 필터는 클라이언트가 한다(현행과 같고 사용자당 평균 100건). 검색도 같은 목록의 메모리 필터로 시작하고 페이징이 필요해질 때 ?query=를 붙인다.

**7 회원 탈퇴와 앱 정책.** (1단계 task) 탈퇴는 전 세션 폐기 + members와 딸린 행 삭제(FK CASCADE)로 시작한다. 운영 Edge Function은 카카오 unlink, 구글 revoke, 애플 revoke까지 했는데 be-dev는 제공자 토큰을 저장하지 않으므로 같은 동작을 하려면 탈퇴 화면의 재인증에서 받은 코드를 그 자리에서 쓴다(남은 결정 5). 앱 업데이트 정책은 설정값(application.yml, 플랫폼당 minimum-supported-version, latest-version, store-url)을 읽는 엔드포인트 하나다.

**앱 업데이트 정책 설계 (2026-09-19 결정, #170).** 정책은 강제와 권고 두 단계다. `minimumSupportedVersion` 아래는 `updateRequired: true`(닫을 수 없는 모달, 스토어로), `latestVersion` 아래는 `updateRecommended: true`(닫을 수 있는 안내)이고 비교는 서버가 해서 boolean으로 내려준다. 값은 `application.yml`에 프로필별로 두고 바꿀 때 재배포한다. 최소 버전은 구버전이 동작하지 못하는 변화(서버 주소 변경, API 버전 제거, 보안 결함)가 있을 때만 올리고 평소 출시는 권고로 밀어 구버전 비율을 줄인다. 필드 해석은 앱 코드에 고정되어 배포된 버전에서는 바꿀 수 없으므로, 권고 UI는 1.2.0(Spring을 부르는 첫 빌드)에 넣어야 하고 그러려면 서버가 `latestVersion`, `updateRecommended`를 먼저 내려주고 있어야 한다. 지금 배포된 1.1.0 앱은 Supabase Edge Function을 부르고 필드 하나를 강제로만 해석하므로, 컷오버 날 1.1.0을 끊는 것은 Spring 값이 아니라 Supabase 환경변수(`APP_UPDATE_*_MINIMUM_SUPPORTED_VERSION`)로 한다. 스토어 점진적 출시가 100%가 된 뒤에만 최소 버전을 올린다. 버전 형식은 `주.부.수정`(두 자리는 수정 0), 앞자리 0과 접미사는 400이다. 근거 조사: 우테코 pheeeew, 소마 732, seorilabs 저장소와 RN, Expo, Firebase 문서(2026-09-19).

**8~11 어댑터.** Edge Function 저장소의 instagram.ts, ai/*, kakao.ts, matching.ts, place_resolution.ts, google.ts, thumbnail.ts가 그대로 사양서다. 포트는 bean-fable의 InstagramContentReader, PlaceNameExtractor, PlaceSearcher 셋이고 썸네일 재호스팅만 포트를 하나 더 둔다(ThumbnailStore, S3). Fake는 fake 프로필에 남겨 E2E가 계속 쓴다.

**9, 10 장소 추출·매칭 설계 (2026-09-29).** Gemini 1차 응답 계약은 아래 JSON으로 고정한다. `nameInCaption`은 캡션 원문, `nameSearchHint`는 오타나 표기 교정을 확신할 때만 내는 검색용 대체 이름이며, null이면 원문 이름을 검색한다. 이 값은 Gemini의 검색 제안이고 카카오맵 등록명으로 확인된 값은 아니다. `accountHints`는 장소 계정으로 보이는 @멘션, `locationHints`는 `{type: ADDRESS|REGION, value, basis: CAPTION|INFERRED}` 배열, `categoryHint`는 분명할 때만 넣는 업종이다. 한 캡션의 여러 장소를 처음 등장한 순서대로 내며, 장소가 없으면 빈 배열이다. Gemini는 전체 캡션의 본문·해시태그·계정 멘션을 읽고 주소나 지역을 추론할 수 있다. 원문에 없는 위치는 `INFERRED`로 표시하며 검색 단서로만 사용한다. 캡션 안의 지시문은 따르지 않고 구조화 응답을 서버에서 다시 검증한다. 실체가 확인된 장소명·주소·좌표·ID는 Gemini 응답으로 확정하지 않고 다음 사이클의 카카오 검색 결과에서 얻는다. 운영 `ai/*` 원본은 이 저장소에 없어 프롬프트 세부사항과 키 폴백 동작은 추가 대조가 남아 있다. 카카오 검색에는 로컬 REST API를 사용한다(결정 12).

**비동기 파이프라인 연결 (2026-09-29).** 공유 커밋 후 Instagram 메타데이터와 썸네일을 저장하고, Gemini 장소 단서를 카카오 로컬 REST API로 검색한다. 이름과 주소가 충돌하거나 같은 점수의 장소가 여럿이면 임의로 선택하지 않는다. 확인된 장소는 `places`와 `media_places`에 저장한다. 추출 성공과 함께 회원의 최신 공유를 확인해 장소를 보관함에 upsert하고 `shared_media_saved_places`에 연결한다. 여러 장소 중 일부만 확인되면 확인된 장소만 저장하고, 하나도 확인되지 않으면 `PLACE_NOT_MATCHED`로 실패한다. Gemini와 카카오 요청 오류는 현재 `UNEXPECTED`로 기록한다. 운영의 AI 판정 루프와 15분 처리 중 고착 인수는 별도 작업으로 남는다. 고착 인수 구현은 6.1 백로그 2에 둔다.

성공한 추출은 `SUCCEEDED`로 저장하며 파이프라인 버전이 바뀌어도 기존 결과를 재사용한다. 같은 미디어가 다시 공유되었을 때 실패 상태이고 저장된 파이프라인 버전이 현재 버전보다 낮으면 재추출을 예약하고 버전을 갱신한다. 버전이 같거나 높으면 기존 실패 결과를 유지한다. 조건부 UPDATE가 재추출 예약을 한 번만 허용한다. 이후 수동 재시도 기능도 같은 버전 조건을 사용한다.

```json
{
  "places": [
    {
      "nameInCaption": "송화산시도삭면",
      "nameSearchHint": null,
      "accountHints": [],
      "locationHints": [
        {"type": "ADDRESS", "value": "서울 광진구 뚝섬로27길 48", "basis": "CAPTION"},
        {"type": "REGION", "value": "건대입구", "basis": "CAPTION"}
      ],
      "categoryHint": "중식당"
    }
  ]
}
```

**13 클라이언트 전환.** 바뀌는 곳은 JS 데이터 계층 10~14파일과 App.tsx의 supabase.auth 의존 5곳, 네이티브 공유 2벌이다. 로그인은 Supabase OAuth(PKCE 브라우저 세션) 대신 제공자 SDK 또는 인가 코드 콜백으로 코드를 받아 /auth/logins에 보내는 구조로 바뀐다. 공유 확장은 액세스 토큰이 만료돼 401을 받으면 결과를 PENDING_AUTH로 저장하고 앱이 포그라운드에서 갱신 후 재접수한다(남은 결정 7).

## 6. 남은 결정

1. **자원 이름.** (PR 0에서 확정) /shares. bean-fable의 /media는 {id}가 공유 id라 게시물(InstagramMedia)과 헷갈린다.
2. **접수 멱등키.** 네이티브 공유 확장이 30초 타임아웃과 재시도를 하므로 clientRequestId(UUID)를 받아 (member_id, request_id) 유니크로 막는 쪽을 권한다. 구현은 6.1 백로그 1에 둔다. 안 받으면 재시도마다 공유 이력이 하나씩 더 생긴다.
3. **테이블 이름.** (정함, 2026-09-16) 현재 데이터 흐름은 `media`, `shared_media`, `media_places`, `places`, `saved_places`, `shared_media_saved_places`, `shared_media_reports`를 사용한다. 게시물은 `media`고 FK 컬럼은 `media_id`, `shared_media_id`다.
4. **응답 DTO 조립.** (바뀜, 2026-09-21) 정적 팩토리 `from`을 기본으로 한다. 항목은 `SavedPlaceResponse.from(projection)`, 목록 껍데기는 `SavedPlaceResponses.from(List<SavedPlaceProjection>)`이 변환을 맡아 서비스는 조회 결과만 넘긴다. 2026-09-16의 부생성자 결정은 목록 껍데기에 `List<XxxProjection>` 부생성자를 둘 수 없어서(제네릭 소거로 정식 생성자와 시그니처가 겹침) 목록 변환이 서비스로 새는 문제가 있었고, #179 리뷰에서 러키가 정적 팩토리로 매핑 책임을 DTO에 모으자고 제안해 팀이 받아들였다. `MemberResponse(Member)` 부생성자 등 기존 DTO도 `from`으로 맞춘다.
5. **탈퇴 시 제공자 연결 해제.** (미결, B의 탈퇴 착수 전에 정한다) 우리 DB 삭제만 할지, 카카오 unlink(admin key + 저장된 provider id)까지 1단계에 넣을지. 구글과 애플 revoke는 제공자 토큰이 필요해 탈퇴 화면의 재인증 코드를 그 자리에서 쓰는 방식으로 어댑터 시기에 붙인다. 애플은 계정 삭제 시 revoke를 요구하고 카카오는 로그인 검수 항목에 연결 끊기가 있어 컷오버 전에는 둘째 겹이 필요하다.
6. **추출 장소 저장.** (확정, 2026-10-06) 장소 추출에 성공하면 확인된 장소를 보관함에 자동 저장하고 해당 공유 이력과 연결한다. 이미 성공한 릴스를 다시 공유하면 새 공유 이력에 기존 추출 결과를 즉시 연결한다.
7. **공유 확장의 만료 토큰.** 401 저장 후 앱 재접수(권장), 또는 확장이 직접 갱신(리프레시 회전 때문에 앱 세션이 깨지므로 비권장).
8. **썸네일 저장소.** (S3로 간다, 2026-09-16) S3 버킷 하나와 ThumbnailStore 포트. 인스타그램 직링크는 1~2주면 만료된다. 버킷과 자격 증명이 준비되는 날에 맞춰 사이클 11에 넣는다.
9. **보관함 검색.** 클라이언트 메모리 필터로 시작(권장), 페이징 도입 시 서버 ?query=.
10. **Fake 어댑터 배치.** be-dev 방식(test, fake 프로필에서 @Primary)으로 통일하고 bean-fable의 상시 @Component Fake는 버린다.
11. **DAO 분리.** (철회, 2026-09-16) 조회 전용 `XxxQueryDao`와 명령 `XxxDao`의 파일 분리는 두 사람이 같은 주에 같은 테이블을 만질 때의 충돌 회피 규칙이었다. 1단계는 자원별로 한 사람이 맡고 2단계는 각자 브랜치에서 전부 만드니 이유가 사라졌다. 조회 DAO가 Projection을 돌려주고 명령 DAO가 도메인 객체를 다루는 설계는 컨벤션 문제로 2단계를 합칠 때 본다.
12. **카카오 매칭 수단.** (정함, 2026-09-29) 카카오 로컬 REST API를 사용한다. 응답의 장소 ID, 이름, 주소, 좌표를 확인해 저장하며 이름이 모호하면 선택하지 않는다. 운영의 AI 판정 루프를 추가할지는 별도로 검토한다.
13. **2단계 합치는 날과 방식.** 후보는 다음 주 목요일(09-24). 비교 기준은 4.3에 적었고, 구현 중 서로 코드를 볼지는 도메인 모델링 때 방식을 따른다.
14. **시각 형식 통일.** (완료, 2026-09-24) 도메인과 애플리케이션의 시각 타입은 `Instant`로 통일하고, DB의 `TIMESTAMP(6)`(마이크로초 단위)를 사용한다. JDBC 경계에서만 `Timestamp`로 변환하며, API 응답과 projection은 ISO-8601 UTC(`Instant`)를 사용한다.
15. **읽기 규칙의 자리.** SQL은 회원 소유 확인과 커서 경계를 처리하고, 서비스는 추출 장소를 보관함 및 공유 이력에 연결한다. 여러 행을 줄이거나 묶는 규칙은 Projection 일급 컬렉션에 두고, 한 항목의 표시값은 DTO의 정적 팩토리에서 계산한다. 규칙 하나를 SQL 반, 자바 반으로 나누지 않는다.

### 6.1 구현 백로그

1. **접수 멱등성.** 네트워크 재시도로 같은 공유 요청이 여러 번 도착해도 공유 이력과 추출 작업을 중복 생성하지 않는다. `clientRequestId`를 요청 ID로 받아 회원별 유일하게 저장하고, 같은 ID·같은 URL은 기존 요청 결과로 수렴시킨다. 같은 ID에 다른 URL이 오면 입력 오류로 거절한다. 사용자가 나중에 의도적으로 다시 공유할 때는 새 ID를 사용한다.
2. **중단된 추출 복구(stale).** 서버 종료 등으로 `EXTRACTING`에서 15분 이상 멈춘 작업을 기동 시 확인하고 다음 공유 요청에서 다시 선점할 수 있게 한다. 조건부 갱신과 작업 토큰으로 같은 미디어를 두 worker가 동시에 처리하지 않게 한다. 재분석 중에도 이미 성공한 장소와 히스토리의 성공 표시는 유지한다.
3. **Gemini 키 fallback.** 현재는 `GEMINI_API_KEY` 하나만 사용한다. 재시도 가능한 요청 실패에서 대체 키를 순서대로 시도하되 전체 시간 제한과 최대 시도 횟수를 두고, 키 값은 로그에 남기지 않는다.

## 7. 부록: 운영 Supabase 구조와의 대응 요점

| 운영 | Spring | 비고 |
|---|---|---|
| reels(요청 이력) + reel_extractions(shortcode 캐시) | shared_media + media | 게시물 한 행, 공유는 사건으로 누적 |
| reel_extraction_places | media_places | 추출된 장소 사실 |
| reel_places | saved_places + shared_media_saved_places | 회원 보관함과 공유 이력의 연결 |
| saved_places | saved_places(+shared_media_saved_places) | (member, place) 유니크, 재저장은 last_saved_at 갱신 |
| user_related_reels 뷰 | shared_media_saved_places 조인 | 릴스당 최신 공유 한 건은 서비스에서 |
| save-instagram-reel-v2 + RPC 11개 | POST /shares + ExtractionPipeline + Recorder | 커밋 후 @Async, 조건부 UPDATE 선점 |
| delete-account | DELETE /members/me | 남은 결정 5 |
| app-update-policy | GET /app-update-policies | 설정값 |
| reel_place_match_failures, provider_usage_monthly | 로그 계층, 사용량 카운터 | 사이클 10, 11 |

## 8. 부록: 운영 Supabase에서 추가로 확인한 사실 (2026-09-16, 마이그레이션 22개와 DB 덤프 대조)

1. **반복 요청 처리(09-01)가 지금 구조의 기본이다.** (user_id, request_id) 멱등키, shortcode + pipeline_version 단위의 추출 캐시(reel_extractions, cacheable 플래그), 15분 stale 인수가 이때 들어왔다. 구현 백로그 1(멱등키)과 2(stale 복구)의 근거다.
2. **운영 DB에 마이그레이션에 없는 `reset_test_data()` 함수가 남아 있다.** `delete from auth.users; delete from public.places;`를 실행하는 SECURITY DEFINER 함수이고 service_role만 부를 수 있지만 운영 프로젝트에 두기에는 위험하므로 Supabase를 닫기 전이라도 지우는 편이 안전하다(이관 작업과는 별개).
3. **접근 통제가 RLS 한 겹뿐이다.** Supabase 클라우드 기본값(ALTER DEFAULT PRIVILEGES)으로 anon과 authenticated에 테이블 GRANT ALL이 걸려 있고 실제 접근은 RLS 정책(전부 TO authenticated)만이 막는다. Spring으로 오면 인가 인터셉터와 서비스의 소유 검증(남의 공유는 404)이 그 역할을 대신한다.
4. **공유 확장의 토큰 갱신 부재는 원 개발자의 기술 부채 목록(docs/architecture.md)에도 적혀 있다.** 남은 결정 7이 새 문제가 아니라 이어받는 문제라는 뜻이다. 같은 목록에 Google 사진 재호스팅 정책 충돌, Kakao ID가 오탐을 막지 못함, 장소 수 상한 없음, 실패 attempt가 공용 데이터를 남길 수 있음이 있어 사이클 10과 11에서 다시 본다.
5. **이관 데이터의 모양.** reels 4,438건 중 request_id가 없는 구버전 행은 (user_id, shortcode) 유니크였고 reel_extractions에는 부분 성공(cacheable = false, 옛 processing_version 2147483647에서 승격)이 섞여 있다. 사이클 14의 이관 스크립트는 cacheable = false 추출을 media의 FAILED 또는 재추출 대상으로 어떻게 옮길지 정해야 한다.
