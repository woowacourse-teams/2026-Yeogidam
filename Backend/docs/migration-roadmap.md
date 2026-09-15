# Supabase → Spring 전환 로드맵 (화면 단위로 나눈 사이클)

작성일 2026-09-16. 근거는 같은 날 읽은 네 가지다. 백엔드 세 트리(bean-fable 217a197, be-dev 1edfa26, feat/#151 작업 트리), 운영 Supabase(hbbrgudsbvnwuylxqlta, CLI 읽기 전용)와 Edge Function 저장소(Jiihyun/yeogidam 02a90f2), 클라이언트(origin/fe-dev 13c40ef), 피그마 화면 명세 1.1.0(40화면)과 FigJam 보드.

## 1. 현재 상태

| 갈래 | 상태 |
|---|---|
| be-dev | 도메인 객체(#138)와 소셜 로그인, 재발급, 로그아웃(#150)까지. 테이블은 members, refresh_sessions 둘. 액세스 토큰으로 사용자를 식별하는 계층은 아직 없다. 테스트 117건(도메인, 클라이언트 단위, @JdbcTest, 통합, E2E). |
| feat/#151 | be-dev 위에 /api/v1 접두어(커밋)와 springdoc 3.1.1 + 문서 인터페이스 분리(a1d4721), 사이클 1 인가(2026-09-16, 리뷰 대기). |
| bean-fable | ADR-02 구조(게시물과 공유 사건 분리, 후보와 결정 분리, 보관함 실체화)로 엔드포인트 11개가 Fake 어댑터 3종과 함께 H2에서 전 구간 돈다. 인증은 X-Member-Id 헤더. |
| 운영 Supabase | 테이블 12개, 파이프라인 RPC 11개(service_role 전용), Edge Function 5개. 클라이언트는 읽기를 PostgREST로 직접 하고 쓰기는 대부분 Edge Function과 RPC resolve_queue_items로 한다. 사용자 35명, 공유 요청 4,438건, 장소 3,521건, 보관 3,525건. |
| 클라이언트 | 화면 13개(연결 안 된 2개 제외). 데이터 접근은 info 도메인(프로필, 보관함, 장소별 릴스)만 Repository로 격리되어 있고 나머지(공유 접수, 상태 폴링, 히스토리, 대기함, 탈퇴, 업데이트 정책)는 모듈 함수가 Supabase를 직접 부른다. 네이티브 공유 확장 2벌이 Edge Function URL을 하드코딩한다. |

## 2. 사이클을 나누는 원칙

파이프라인이 여러 기능과 엮여 보이는 이유는 파이프라인이 **쓰기 쪽**이고 화면들이 전부 그 결과를 **읽는 쪽**이기 때문이다. 둘 사이의 계약은 테이블 여덟 개(스키마)뿐이므로 스키마를 먼저 고정하고 파이프라인 자리에 Fake를 두면 화면은 파이프라인과 무관하게 한 화면씩 붙일 수 있다. bean-fable이 이미 같은 구조(포트 3개 + Fake 3개 + afterCommit 디스패치)라서 새로 설계할 것은 없다.

1. **공통 사이클과 화면 사이클을 구분한다.** 공통 사이클은 /api/v1, Swagger, 인가, 에러 계약, 페이징 규약처럼 화면과 무관한 기반 작업이고 각각 반나절에서 하루짜리다. 화면 사이클은 "피그마 화면 하나(또는 한 묶음)가 실제 HTTP로 끝까지 돈다"가 완료 조건이다.
2. **화면 사이클의 순서는 데이터가 만들어지는 순서다.** 접수(공유) → 히스토리 → 대기함(결정) → 보관함 → 상세 → 지도 → 마이. 앞 화면이 만든 행을 뒤 화면이 읽으므로 E2E 픽스처가 자연스럽게 쌓인다.
3. **파이프라인 실체화는 화면이 다 돈 뒤에 어댑터 하나씩 한다.** 인스타그램 조회, AI 추출, 카카오 매칭, 구글 사진은 각각 포트 하나를 교체하는 일이고 스키마와 화면을 건드리지 않는다.
4. **여러 테이블을 읽을 때는 서비스가 조립한다.** DAO는 한 테이블 또는 단순 조인까지만 맡고 "릴스당 최신 공유 한 건", "회원별 최신 공유에만 후보 발급" 같은 규칙은 서비스나 도메인에 둔다. bean-fable의 DAO 감사(dao-subquery-audit.md)가 SQL에 들어간 규칙 두 건(#5, #6)을 이미 지적했으니 옮길 때 그 권고대로 한다.
5. **be-dev에서 합의된 것은 be-dev 방식으로 통일한다.** 테이블 복수형과 DATETIME(6), Instant와 주입된 Clock, 도메인당 XxxException 하나 + XxxErrorCode(noRollbackFor용 하위 예외만 예외), Fake는 test와 fake 프로필에서 @Primary, 테스트 4계층(Testcontainers MySQL). bean-fable 코드를 옮길 때 위 다섯 가지를 맞춘다.

## 3. 화면별 필요 API (v1 제안)

경로는 전부 /api/v1 아래이고 인증이 필요한 API는 Authorization: Bearer 액세스 토큰을 받는다. 상태 표기는 있음(be-dev), 이식(bean-fable에 있음), 신규다.

| 화면(피그마) | API | 응답 요지 | 상태 |
|---|---|---|---|
| P-1 로그인 | POST /auth/logins/{kakao,google,apple} | 토큰 쌍 + 회원 | 있음 |
| (세션) | POST /auth/token-refreshes, POST /auth/logouts | 회전, 폐기 | 있음 |
| P-5 마이 A, A-1 | GET /members/me | id, nickname, imageUrl, oauthProvider | 있음(사이클 1 완료) |
| P-5 회원탈퇴 B | DELETE /members/me | 204. 전 세션 폐기 + 회원 데이터 삭제 | 신규 |
| P-2 링크 입력 B, B-1, 공유 확장 | POST /shares {instagramUrl, source, clientRequestId} | 202 {shareId, extractionStatus} / 400 미지원 링크 | 이식(POST /media) |
| P-6 히스토리 B, B-1 | GET /shares?cursor&size | {shares:[{shareId, sharedAt, thumbnailUrl, caption, author, extractionStatus, originalUrl}], nextCursor} | 이식 + 페이징 신규 |
| P-6 성공/실패 상세 C, C-1, 접수 후 상태 폴링 | GET /shares/{shareId} | 상세 + failureReason + originalUrl + places[{placeId, name, category, addressSummary, thumbnailUrl, decisionStatus}] | 이식 |
| P-6 실패 상세 C-1 | POST /shares/{shareId}/extraction-retries, POST /shares/{shareId}/reports | 202 / 201 | 이식 |
| P-6 대기함 A~A-5 | GET /place-candidates | UNDECIDED 후보가 있는 공유 목록. 공유마다 places[] 포함 | 신규 |
| P-6 대기함 저장/삭제 | POST /shares/{shareId}/place-selections, POST /shares/{shareId}/place-discards {placeIds} | 201 | 이식 |
| P-2 보관함 A, A-1, D, D-1 | GET /saved-places | [{placeId, name, category, addressSummary, roadAddress, address, latitude, longitude, kakaoPlaceUrl, telephone, thumbnailUrl, lastSavedAt, mediaCount}] lastSavedAt 내림차순 | 이식 + lastSavedAt 추가 |
| P-2 보관함 편집 D-1 | DELETE /saved-places/{placeId} | 204. 다건은 클라이언트 반복 호출 | 이식 |
| P-2 검색 C, C-1, C-2 | (클라이언트 메모리 필터. 검색 기록은 단말 저장) | 서버 API 없음. 페이징을 넣게 되면 ?query= 추가 | 결정 |
| P-3 지도 전부 | GET /saved-places (좌표 포함 전량), GET /saved-places/{placeId}/media (시트의 이미지 띠) | 지도 범위와 검색어 필터는 클라이언트 | 이식 |
| P-4 장소 상세 전부 | GET /saved-places/{placeId}, GET /saved-places/{placeId}/media, DELETE /saved-places/{placeId} | 장소 정보 / 관련 공유 [{shareId, thumbnailUrl, author, caption, originalUrl, sharedAt}] | 상세만 신규 |
| 강제 업데이트 모달 | GET /app-update-policies?platform&appVersion | {updateRequired, minimumSupportedVersion, storeUrl}, 인증 없음 | 신규 |

공통 계약도 있다. 에러 응답은 be-dev의 {message, errorCode}이고 클라이언트가 쓰던 retryable, requestId는 뺀다. 상태 어휘는 EXTRACTING, SUCCEEDED, FAILED와 UNDECIDED, SAVED, DISCARDED, SUPERSEDED다. 폴링은 클라이언트 현행(상태 3초, 히스토리와 대기함 5초)을 유지한다. 시각은 ISO-8601 UTC(Instant)다.

## 4. 사이클 로드맵

| # | 사이클 | 종류 | 화면 | 만드는 것 | 완료 조건 |
|---|---|---|---|---|---|
| 0 | 인증, /api/v1, Swagger | 공통 | 로그인 | (완료) #150, 64ff616, a1d4721 | 커밋 |
| 1 | 인가 기초 작업 | 공통 | 마이 A, A-1 | (완료 2026-09-16) 액세스 토큰 인터셉터, @LoginMember 리졸버, GET /members/me, 401 계약(AUTH401_004), E2E 로그인 헬퍼 | 토큰 없이 401, 있으면 내 정보 |
| 2 | 스키마 계약과 접수 기본 흐름 | 화면 | 링크 입력 B, B-1 | bean-fable 테이블 8개를 be-dev 규칙으로 이식, POST /shares, Fake 3종(fake 프로필), afterCommit 디스패치, GET /shares/{shareId} | 링크를 보내면 Fake가 돌아 SUCCEEDED 상세가 나온다 (awaitility) |
| 3 | 히스토리 | 화면 | 히스토리 B, B-1, C, C-1 | GET /shares(커서 페이징), extraction-retries, reports | 실패 건 재시도가 EXTRACTING으로 돌아간다 |
| 4 | 대기함 | 화면 | 대기함 A~A-5 | GET /place-candidates, place-selections, place-discards, saved_places upsert, SUPERSEDED 재공유 규칙 | 저장한 장소가 보관함에 한 행으로 생긴다 |
| 5 | 보관함과 장소 상세 | 화면 | 보관함 A, A-1, D, D-1, 장소 상세 전부 | GET /saved-places(lastSavedAt), GET /saved-places/{placeId}, /media, DELETE | 삭제해도 후보와 이력은 남는다 |
| 6 | 지도와 검색 | 화면 | 지도 전부, 검색 C | 좌표 포함 확인, 시트 이미지 띠(/media 재사용), 검색은 클라이언트 필터로 결정 | 핀 = saved_places 행 |
| 7 | 회원 탈퇴와 앱 정책 | 화면 | 회원탈퇴 B, 강제 업데이트 모달 | DELETE /members/me, GET /app-update-policies(설정값) | 탈퇴 후 토큰 전부 401 |
| 8 | 인스타그램 조회 어댑터 | 어댑터 | (없음) | HTML meta 파싱(Edge Function instagram.ts 이식), 실패 사유 CONTENT_UNAVAILABLE, 썸네일 저장소 포트(S3)와 재호스팅 | 실제 릴스 링크로 캡션과 썸네일이 들어온다 |
| 9 | AI 추출 어댑터 | 어댑터 | (없음) | Gemini 호출, 프롬프트와 JSON 스키마 이식, 타임아웃과 키 폴백 | 캡션에서 장소 후보 배열이 나온다 |
| 10 | 카카오 매칭 어댑터 | 어댑터 | (없음) | 키워드 검색 + 주소 좌표 + AI 판정 루프(place_resolution.ts 이식), 매칭 실패 진단은 로그 | 후보가 places 행으로 저장된다 |
| 11 | 사진 폴백과 사용량 상한 | 어댑터 | (없음) | Google Places 사진, 카카오 og:image 폴백, 월 900회 상한 | 썸네일 없는 장소가 사라진다 |
| 12 | 운영 장애 대비 | 공통 | (없음) | 처리 중 고착 인수(stale 15분), 기동 복구(있음), 관측 로그, 알림(선택) | 비정상 종료 뒤에도 EXTRACTING이 남지 않는다 |
| 13 | 클라이언트 전환 | 전환 | 전부 | 인증 SDK(제공자 인가 코드 → /auth/logins), 데이터 어댑터 교체, 네이티브 공유 2벌, 토큰 저장 | Supabase 호출 0건 |
| 14 | 데이터 이관 | 전환 | (없음) | supabase-migration-parity.md 매핑으로 1회 이관 스크립트, 검증 쿼리 | 사용자 35명 보관함 개수 일치 |
| 15 | 컷오버 | 전환 | (없음) | 운영 배포, 강제 업데이트로 구버전 차단, Supabase 읽기 전용 → 종료 | 앱스토어 새 버전 |

사이클 1부터 7까지가 끝나면 모든 화면이 Fake 파이프라인으로 실제 HTTP에서 돌고 그 시점부터 클라이언트 전환(13)을 병행할 수 있다. 어댑터 사이클(8~11)은 화면과 독립이라 페어가 나눠 맡기 좋다.

### 사이클별 메모

**1 인가 기초 작업.** (2026-09-16 완료) 구조는 spring-roomescape-waiting의 auth 패키지를 따랐다. LoginCheckInterceptor가 /api/** 중 /api/v1/auth/**를 뺀 경로에서 Bearer 토큰을 검증하고, LoginMemberArgumentResolver가 @LoginMember Long에 회원 식별자를 넣으며, 토큰 없음은 AUTH401_004, 깨지거나 만료된 토큰은 AUTH401_001이다. E2eTestSupport에 "로그인해서 액세스 토큰을 얻는" 헬퍼를 두면 이후 모든 화면 E2E가 같은 헬퍼를 쓴다. 액세스 토큰 만료 30분은 공유 확장이 같은 토큰을 쓰므로 사이클 13에서 다시 본다.

**2 스키마 계약과 접수 기본 흐름.** 사이클 2가 가장 크고 여기서 정하는 것이 이후 전부의 계약이다. bean-fable schema.sql의 instagram_media, media_share, media_place, share_place, place, saved_place, saved_place_share, media_share_report를 복수형(instagram_medias는 어색하므로 instagram_posts를 검토), DATETIME(6), CREATE IF NOT EXISTS로 옮긴다. 접수 서비스(InstagramMediaService.createInstagramMedia)는 회원 확인, URL 파싱, 게시물 find-or-create, 재공유 시 SUPERSEDED 닫기, 공유 삽입, 후보 발급 또는 재추출 선점, 커밋 후 디스패치까지 하나의 트랜잭션이다. 멱등키 clientRequestId를 받을지는 남은 결정 2다. 테스트는 도메인(이미 있음), @JdbcTest(DAO), 서비스 통합, E2E(awaitility로 Fake 완료 대기) 네 겹이다.

**3 히스토리.** 목록은 커서(sharedAt, shareId) 페이징이고 클라이언트가 이미 같은 방식(50건)이다. 재시도는 FAILED에서만 도메인이 허용하고 DB 조건부 UPDATE가 경쟁을 막는다(bean-fable 그대로).

**4 대기함.** GET /place-candidates는 서비스 오케스트레이션의 대표 예다. 회원의 공유 중 UNDECIDED 후보가 하나라도 있는 것을 최신순으로 읽고 그 공유들의 후보(share_place ⋈ place)를 한 번 더 읽어 서비스에서 묶는다. 결정은 공유 건 단위(SharedInstagramMedia.decidePlaces)라 여러 릴스를 한 번에 고르면 클라이언트가 공유마다 호출한다(남은 결정 6).

**5 보관함과 장소 상세.** 보관함 응답에 lastSavedAt을 넣어 정렬 근거를 준다(client-impact-report 남은 확인 2). 장소 상세는 목록 항목과 같은 모양이라 DTO를 공유한다. 관련 릴스 목록의 "릴스당 최신 공유 한 건" 규칙은 SQL 대신 서비스에서 groupingBy로 만든다.

**6 지도와 검색.** 지도는 보관함 목록을 좌표까지 그대로 쓰고 범위 필터는 클라이언트가 한다(현행과 같고 사용자당 평균 100건). 검색도 같은 목록의 메모리 필터로 시작하고 페이징이 필요해질 때 ?query=를 붙인다.

**7 회원 탈퇴와 앱 정책.** 탈퇴는 전 세션 폐기 + members와 딸린 행 삭제(FK CASCADE)다. 운영 Edge Function은 카카오 unlink, 구글 revoke, 애플 revoke까지 했는데 be-dev는 제공자 토큰을 저장하지 않으므로 같은 동작을 하려면 탈퇴 화면의 재인증에서 받은 코드를 그 자리에서 쓴다(남은 결정 5). 앱 업데이트 정책은 설정값(application.yml) 네 개를 읽는 엔드포인트 하나다.

**8~11 어댑터.** Edge Function 저장소의 instagram.ts, ai/*, kakao.ts, matching.ts, place_resolution.ts, google.ts, thumbnail.ts가 그대로 사양서다. 포트는 bean-fable의 InstagramContentReader, PlaceNameExtractor, PlaceSearcher 셋이고 썸네일 재호스팅만 포트를 하나 더 둔다(ThumbnailStore, S3). Fake는 fake 프로필에 남겨 E2E가 계속 쓴다.

**13 클라이언트 전환.** 바뀌는 곳은 JS 데이터 계층 10~14파일과 App.tsx의 supabase.auth 의존 5곳, 네이티브 공유 2벌이다. 로그인은 Supabase OAuth(PKCE 브라우저 세션) 대신 제공자 SDK 또는 인가 코드 콜백으로 코드를 받아 /auth/logins에 보내는 구조로 바뀐다. 공유 확장은 액세스 토큰이 만료돼 401을 받으면 결과를 PENDING_AUTH로 저장하고 앱이 포그라운드에서 갱신 후 재접수한다(남은 결정 7).

## 5. 남은 결정

1. **자원 이름.** bean-fable의 /media는 {id}가 공유 id라 게시물(InstagramMedia)과 헷갈린다. /shares를 제안하고, 유지하려면 /media 그대로 써도 나머지는 같다.
2. **접수 멱등키.** 네이티브 공유 확장이 30초 타임아웃과 재시도를 하므로 clientRequestId(UUID)를 받아 (member_id, request_id) 유니크로 막는 쪽을 권한다. 안 받으면 재시도마다 공유 이력이 하나씩 더 생긴다.
3. **테이블 이름.** be-dev가 복수형(members)이므로 전부 복수형으로 맞춘다. instagram_media는 instagram_posts 또는 instagram_medias 중 택일.
4. **응답 DTO 조립.** CLAUDE.md의 bean-fable 결정은 from 정적 팩토리, be-dev #150은 보조 생성자다. 하나로 정한다.
5. **탈퇴 시 제공자 연결 해제.** 운영과 같게 unlink/revoke까지 할지, 우리 DB 삭제만 할지.
6. **대기함 다건 결정.** 공유 건마다 호출(도메인 경계와 일치) 또는 배치 엔드포인트 하나.
7. **공유 확장의 만료 토큰.** 401 저장 후 앱 재접수(권장), 또는 확장이 직접 갱신(리프레시 회전 때문에 앱 세션이 깨지므로 비권장).
8. **썸네일 저장소.** S3 계열 버킷 하나와 ThumbnailStore 포트. 인스타그램 직링크는 1~2주면 만료된다.
9. **보관함 검색.** 클라이언트 메모리 필터로 시작(권장), 페이징 도입 시 서버 ?query=.
10. **Fake 어댑터 배치.** be-dev 방식(test, fake 프로필에서 @Primary)으로 통일하고 bean-fable의 상시 @Component Fake는 버린다.

## 6. 부록: 운영 Supabase 구조와의 대응 요점

| 운영 | Spring | 비고 |
|---|---|---|
| reels(요청 이력) + reel_extractions(shortcode 캐시) | media_share + instagram_media | 게시물 한 행, 공유는 사건으로 누적 |
| reel_extraction_places / reel_places | media_place(사실) / share_place(후보와 결정) | review_status → decision_status, PENDING → UNDECIDED |
| reel_queue_batches, reel_queue_items | share_place | 배치 resolved_at 역할을 SUPERSEDED가 한다 |
| saved_places | saved_place(+saved_place_share) | (member, place) 유니크, 재저장은 last_saved_at 갱신 |
| user_related_reels 뷰 | saved_place_share 조인 | 릴스당 최신 공유 한 건은 서비스에서 |
| save-instagram-reel-v2 + RPC 11개 | POST /shares + ExtractionPipeline + Recorder | 커밋 후 @Async, 조건부 UPDATE 선점 |
| resolve_queue_items | place-selections, place-discards | 큐 항목 id → shareId + placeIds |
| delete-account | DELETE /members/me | 남은 결정 5 |
| app-update-policy | GET /app-update-policies | 설정값 |
| reel_place_match_failures, provider_usage_monthly | 로그 계층, 사용량 카운터 | 사이클 10, 11 |

## 7. 부록: 운영 Supabase에서 추가로 확인한 사실 (2026-09-16, 마이그레이션 22개와 DB 덤프 대조)

1. **대기함은 한 번 롤백된 적이 있다.** 2026-08-27에 큐(review_status)를 도입했다가 08-28에 "대기함/히스토리 기능이 운영 앱보다 먼저 배포되어 기존 saved_places 계약이 깨진 상태"를 복구하려고 전부 되돌렸고 08-30에 v1(AUTO_SAVE)과 v2(REVIEW_QUEUE)가 같은 스키마에서 병행되도록 재도입했다. 서버 동작을 앱보다 먼저 바꾸면 깨진다는 교훈이라 컷오버(사이클 15)는 app-update-policies로 구버전을 막은 뒤에 한다.
2. **반복 요청 처리(09-01)가 지금 구조의 기본이다.** (user_id, request_id) 멱등키, shortcode + pipeline_version 단위의 추출 캐시(reel_extractions, cacheable 플래그), 15분 stale 인수, 대기함 카드의 세대 watermark가 이때 들어왔다. 남은 결정 2(멱등키)와 사이클 12(stale 인수)의 근거다.
3. **운영 DB에 마이그레이션에 없는 `reset_test_data()` 함수가 남아 있다.** `delete from auth.users; delete from public.places;`를 실행하는 SECURITY DEFINER 함수이고 service_role만 부를 수 있지만 운영 프로젝트에 두기에는 위험하므로 Supabase를 닫기 전이라도 지우는 편이 안전하다(이관 작업과는 별개).
4. **접근 통제가 RLS 한 겹뿐이다.** Supabase 클라우드 기본값(ALTER DEFAULT PRIVILEGES)으로 anon과 authenticated에 테이블 GRANT ALL이 걸려 있고 실제 접근은 RLS 정책(전부 TO authenticated)만이 막는다. Spring으로 오면 인가 인터셉터와 서비스의 소유 검증(남의 공유는 404)이 그 역할을 대신한다.
5. **공유 확장의 토큰 갱신 부재는 원 개발자의 기술 부채 목록(docs/architecture.md)에도 적혀 있다.** 남은 결정 7이 새 문제가 아니라 이어받는 문제라는 뜻이다. 같은 목록에 Google 사진 재호스팅 정책 충돌, Kakao ID가 오탐을 막지 못함, 장소 수 상한 없음, 실패 attempt가 공용 데이터를 남길 수 있음이 있어 사이클 10과 11에서 다시 본다.
6. **이관 데이터의 모양.** reels 4,438건 중 request_id가 없는 구버전 행은 (user_id, shortcode) 유니크였고 reel_extractions에는 부분 성공(cacheable = false, 옛 processing_version 2147483647에서 승격)이 섞여 있다. 사이클 14의 이관 스크립트는 cacheable = false 추출을 instagram_media의 FAILED 또는 재추출 대상으로 어떻게 옮길지 정해야 한다.
