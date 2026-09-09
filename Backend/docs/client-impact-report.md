# 클라이언트 영향도 보고서: bean-fable API로 전환하면 프론트는 얼마나 바뀌는가

조사 기준은 origin/fe-dev(2026-09-09 시점, fe-release/1.1.0과 Frontend/src가 동일)의 React Native 앱과, bean-fable 작업 트리의 컨트롤러·DTO다. 조사와 판정만 하며 코드는 바꾸지 않았다.

## 1. 클라이언트 호출 인벤토리

프론트의 서버 호출은 대부분 데이터 계층(entities/*/api.ts, lib/auth)에 격리되어 있고, 화면은 스네이크 표기를 카멜로 바꾼 표시 모델을 소비한다. 예외가 둘 있는데, 네이티브 공유 확장(Android ShareSaveWorker.kt, iOS ShareViewController.swift)이 JS를 거치지 않고 직접 서버를 부른다.

| 기능 | 지금 부르는 것 | 파일 |
|---|---|---|
| 로그인 | supabase.auth OAuth(카카오·구글·애플)와 이메일, 세션·토큰 갱신 | lib/auth/* |
| 프로필 | profiles 테이블 POST·PATCH·GET (닉네임, 소개, 아바타) | entities/info/api.ts |
| 공유 접수 | 엣지 함수 save-instagram-reel-v2, 본문 {instagramUrl, source, clientRequestId} | entities/content/api.ts + **Android·iOS 네이티브 2벌** |
| 처리 상태 폴링 | reels 테이블 select (PENDING·PROCESSING 조회, 최신 진행 건 복원) | entities/content/api.ts |
| 히스토리 | reels select, keyset 커서로 50개씩 | entities/content/api.ts |
| 히스토리 상세 | reels + reel_extractions + reel_extraction_places + places 조인 한 방 | entities/content/api.ts |
| 대기함 목록 | reel_queue_batches REST (미해결 배치 + PENDING 큐 항목 + 장소 조인) | entities/content/inbox-api.ts |
| 대기함 결정 | RPC resolve_queue_items(큐 항목 id 배열, SAVE 또는 DISCARD) | entities/content/inbox-api.ts |
| 보관함 목록 | saved_places select (places 조인, last_saved_at 포함) | entities/info/api.ts |
| 보관함 삭제 | saved_places DELETE (savedPlaceId 단위, 여러 개는 루프) | entities/info/api.ts |
| 핀의 릴스 목록 | user_related_reels select (place_id 조건) | entities/info/api.ts |
| 실패 제보 | reel_reports upsert | entities/content/api.ts |
| 계정 삭제 | 엣지 함수 delete-account | lib/auth/deleteAccount.ts |
| 앱 업데이트 정책 | 버전 정책 테이블 조회 | lib/app-update-policy.ts |

## 2. 대응표와 판정

판정은 넷이다. 그대로 대응(의미와 재료가 일치, 어댑터 교체만) / 모양만 다름(필드명·구조·어휘 diff) / 대응 없음(서버 갭) / 서버에 있는데 클라이언트가 안 씀.

| 클라이언트 호출 | bean-fable 대응 | 판정 | diff 요지 |
|---|---|---|---|
| 공유 접수 | POST /media {instagramUrl} | 모양만 다름 | source·clientRequestId(멱등키) 없음. 응답 어휘 PENDING·PROCESSING·COMPLETED·FAILED → EXTRACTING·SUCCEEDED·FAILED. saveMode·reused 없음(재사용 여부는 즉시 SUCCEEDED로 구분 가능) |
| 처리 상태 폴링 | GET /media/{shareId} | 모양만 다름 | 전용 상태 조회 대신 상세 재사용. "최신 진행 건 복원" 전용 조회는 없어 히스토리 첫 페이지로 대체 |
| 히스토리 | GET /media | 모양만 다름 + 갭 하나 | instagram_title 제거·caption 일원화는 클라이언트 title.ts가 이미 description(캡션) 우선이라 순조롭다. 다만 목록 응답에 원본 URL이 없고(상세에만 originalUrl), **페이지네이션이 없다**(클라는 keyset 50개씩) |
| 히스토리 상세 | GET /media/{shareId} | 모양만 다름 + 필드 갭 | 조인 중첩(extraction.extraction_places[].place) → 평평한 places[]. **장소에 latitude·longitude·photoAttribution·sourceAddress가 없다**(위경도는 보관함 응답에만 있음, photo_attribution은 task 11) |
| 대기함 목록 | 없음 | **대응 없음** | "미해결 후보가 있는 공유 목록"을 주는 API가 없다. task 17(GET /place-candidates)이 정확히 이 자리다 |
| 대기함 결정 | POST /media/{shareId}/place-selections·place-discards | 모양만 다름 | 단위가 큐 항목 id → shareId + placeIds로 바뀜. 어휘 PENDING → UNDECIDED, review → decision |
| 보관함 목록 | GET /saved-places | 모양만 다름 | 조인 중첩 → 평평. **last_saved_at·created_at이 응답에 없다**(정렬 근거 갭). savedPlaceId 별도 id 개념이 없어짐 |
| 보관함 삭제 | DELETE /saved-places/{placeId} | 모양만 다름 | savedPlaceId → placeId 단위. 루프 삭제는 그대로 가능 |
| 핀의 릴스 목록 | GET /saved-places/{placeId}/media | 그대로 대응 | originalUrl·썸네일 제공, caption·author가 오히려 추가됨. 릴스당 최신 공유 한 건 규칙도 서버가 보장 |
| 실패 제보 | POST /media/{shareId}/reports | 그대로 대응 | upsert 멱등만 확인 필요 |
| 로그인·세션 | 없음 (X-Member-Id 대체) | **대응 없음** | 3절 참조 |
| 프로필(소개·아바타 포함) | POST /members(nickname, provider, providerUserId)뿐 | **대응 없음** | 조회·수정 API와 description·avatar 필드가 없다 |
| 계정 삭제 | 없음 | **대응 없음** | |
| 앱 업데이트 정책 | 없음 | **대응 없음** | 서버 도메인 밖이라 별도 유지 가능 |
| (서버만 있음) POST /media/{shareId}/extraction-retries | | 클라 미사용 | 클라이언트는 재시도를 재저장 호출로 처리한다. 재공유 접수가 동작하므로 어느 쪽이든 가능 |
| (서버만 있음) mediaCount, 세분화된 에러코드(MEDIA400_005~009) | | 클라 미사용 | 보관함 응답의 mediaCount, 재시도 사유 세분은 화면 요구가 생기면 쓸 재료 |

집계: 그대로 대응 2, 모양만 다름 7, 대응 없음 5(그중 앱 정책 1은 서버 도메인 밖), 클라 미사용 2.

## 3. 인증 갭: 전환의 선결 조건이다

클라이언트의 모든 호출이 수파베이스 OAuth 세션의 JWT를 Authorization 헤더에 싣고, 401이면 refreshSession 후 재시도하는 구조다. bean-fable은 인증이 없고 X-Member-Id 대체 헤더뿐이다(task 8). 개발·데모는 X-Member-Id 어댑터로 가능하지만, 실사용자 앱을 붙이려면 여기담 로그인(OAuth 코드 검증, 세션 또는 토큰 발급, 갱신)이 먼저다. Member에 OAuthAccount 필드는 준비되어 있으므로 task 8이 정확히 이 갭을 메운다. 네이티브 공유 2벌도 같은 토큰 체계를 써야 하므로 인증 설계에 "JS 밖에서 토큰 접근"이 요구사항으로 들어가야 한다.

## 4. 폭발 반경: 핵폭탄은 아니다

**바뀌는 파일 추정.** JS 데이터 계층 10~14개(entities/content의 api·inbox-api·errors·types·title 일부, entities/info의 api·types, entities/place/api, configureDataSources, lib/auth 교체, share-intent, reel-save-state 어휘) + 네이티브 공유 Android 5개 내외·iOS 2개. 화면 컴포넌트는 표시 모델(카멜)이 이미 완충층이라, 어댑터가 같은 표시 모델을 뱉으면 거의 무손질이다. 대기함 화면(inBoxScreen)만 단위 변화(큐 항목 → share+place)로 로직이 일부 바뀐다.

**핵폭탄인가.** 아니다. 이유는 셋이다. 첫째, 클라이언트가 이미 api 계층으로 격리되어 있고 스네이크 → 카멜 변환층을 갖고 있어서, 전환은 그 계층의 구현 교체다. 둘째, 필드 어휘 차이(caption·author, UNDECIDED, EXTRACTING)는 전부 어댑터에서 흡수 가능한 이름 매핑이다. 셋째, 제일 큰 화면(지도·보관함·핀 상세)은 그대로 대응 내지 평평해진 쪽이라 오히려 단순해진다. 다만 서버 갭 5개(인증, 대기함 목록, 히스토리 페이지네이션, 상세 장소의 위경도·photoAttribution, 프로필·계정삭제)는 클라이언트가 흡수할 수 없는 몫이라 전환 전에 서버가 채워야 한다.

**단계 제안.**

1. 서버 갭 보강: task 8(인증) → task 17(대기함 목록) → GET /media 페이지네이션 → 상세 PlaceResponse에 위경도(+task 11 photoAttribution) → 프로필·계정삭제 API.
2. JS 어댑터 스위치: entities/*/api.ts에 bean-fable 구현을 나란히 만들고 환경 플래그로 전환(표시 모델 불변이 검증 기준).
3. 네이티브 공유 2벌 교체(엔드포인트 + 토큰).
4. 화면별 검증은 대기함 → 히스토리 → 지도 순(단위 변화가 있는 곳부터).

## 남은 확인

- 접수 멱등키(clientRequestId)를 서버가 받을지, 아니면 shortcode 재사용이 사실상 멱등을 대신한다고 볼지.
- 보관함 정렬 근거(last_saved_at)를 응답에 추가할지.
- 히스토리 목록에 원본 URL을 실을지(실패 릴스의 "원본으로 이동"이 목록에서 바로 필요하면).
