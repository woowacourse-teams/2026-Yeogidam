# 공유·추출·로그인·히스토리·장소 활용 이벤트

현재 코드에 실제로 연결된 이벤트를 기준으로 정리한다(2026-11-04 확인). 대상은 Android·iOS 공유 화면, 기기의 전송·추출 작업, 앱의 진입·로그인·히스토리·장소 활용 이벤트다.
연동 구조, 사용자 식별, 공통 속성(`environment`, `installation_id`, `is_guest` 등), 보내지 않는 정보, 테스터 제외 방법은 [README.md](./README.md)에 있다. 범용 UI 이벤트는 [UI_EVENTS.md](./UI_EVENTS.md)에 있다.

> **🆕 표시**는 2.2.1 다음 스토어 빌드부터 수집되는 항목이다. 그 이전 버전에는 데이터가 없으므로 기간을 비교할 때 앱 버전(`release`)으로 나눠 본다.

## 1. 이 문서에서 쓰는 ID

| ID | 붙는 곳 | 의미 |
| --- | --- | --- |
| `share_id` | 네이티브 공유 이벤트, 공유에서 온 로그인 이벤트 | 공유 화면에 들어온 한 번의 시도. 네이티브의 `requestId`와 같은 값이다 |
| `content_id` | 추출 결과, 히스토리 이벤트 | 히스토리 콘텐츠 ID. API의 `reelId`를 이벤트에서만 `content_id`로 바꿔 부른다 |
| `place_view_id` | 장소 활용 이벤트 | 한 번의 장소 탐색(선택 → 상세 → 지도)을 잇는 ID |
| `request_id` | 히스토리 재시도 추출 이벤트 | API의 `clientRequestId`. 재시도 요청의 시작과 종료를 잇는다 |

네이티브 공유 이벤트의 `distinct_id`는 기록 시점에 저장된 세션의 회원 ID이고, 세션이 없으면 `share_id`다(프로필 생성 안 함). 그래서 세션이 없던 공유는 앱 사용자와 자동으로 연결되지 않는다. 공유 건 단위로 볼 때는 `share_id`로 묶는다.

## 2. 공유 화면 (네이티브)

코드: iOS [`ShareCardViewController.swift`](../../ios/Shared/ShareCardViewController.swift)(Share·Action Extension 공용), Android [`ShareActivity.kt`](../../android/app/src/main/java/com/yeogidamm/app/share/ShareActivity.kt)

흐름: 공유 → `reel_share_received` → 결과 카드 표시(`feedback_viewed`, `outcome_viewed`) → 버튼(`action_clicked`) → 닫힘(`card_dismissed`)

| 이벤트 | 발생 기준 | 속성 |
| --- | --- | --- |
| `reel_share_received` | 공유 화면이 열리고 `share_id`가 생성됨 | — |
| `reel_share_feedback_viewed` | 결과 카드가 표시됨 (기존 명세) | `feedback_type` |
| `reel_share_outcome_viewed` | 결과 카드가 표시됨 (새 명세) | `outcome`, `reason` |
| 🆕 `reel_share_action_clicked` | 카드 버튼을 누름 | `action`, `result` |
| 🆕 `reel_share_card_dismissed` | 공유 화면이 닫힘 | `method`, `card_state` |

### 카드별 기록

| 사용자가 보는 카드 | `feedback_type` | `outcome` / `reason` | 버튼 |
| --- | --- | --- | --- |
| "공유 완료!" | `received` | `accepted` | 앱에서 보기 |
| "공유 완료!" (가입 전 체험 게시물) | `received` | 기록 안 함 | 앱에서 보기 |
| "로그인 해주세요" | `login_required` (🆕 Android) | `login_required` / `no_session`, `refresh_token_missing`, `refresh_token_invalid` | 로그인 |
| "릴스·게시물만 공유할 수 있어요" | `invalid_link` | `failed` / `invalid_link` | 닫기 |
| "릴스를/게시물을 전달하지 못했어요" | `save_failed` | `failed` / `save_failed` | 닫기 |
| "링크를 확인하지 못했어요" (Android만) | `read_failed` | 🆕 `failed` / `read_failed` | 닫기 |

- `no_session`은 로그인한 적이 없는 경우, `refresh_token_*`는 세션이 만료된 경우다.
- `read_failed`는 Android에서 공유 데이터를 꺼내거나 URL을 파싱하다 예외가 난 경우다. iOS는 같은 상황을 `invalid_link`로 기록한다.
- 링크만 기기에 저장되고 후속 전송 등록이 실패해도 "공유 완료!"를 보여 주며 `accepted`로 기록한다. 화면에 보인 안내 기준이기 때문이다.
- `feedback_viewed`와 `outcome_viewed`는 공유 건당 **처음 표시된 카드 하나만** 기록한다. 로그인 카드 다음에 실패 카드로 바뀌어도 `login_required`로 남는다. 그 실패는 `action_clicked`의 `result`로 확인한다.

### 🆕 버튼과 닫힘

| `action` | 버튼 | `result` |
| --- | --- | --- |
| `open_app` | 앱에서 보기 | `opened`, `open_failed` |
| `login` | 로그인 | `opened`, `open_failed`, `save_failed`(앱에 넘길 링크 저장 실패) |
| `close` | 닫기 | 없음 |

| `method` | 닫힌 방법 |
| --- | --- |
| `app_opened` | 버튼으로 앱을 열어 닫힘 |
| `close_button` | 닫기 버튼 |
| `tap_outside` | 바깥 탭. iOS는 카드 본문 탭도 포함한다 |
| `auto` | 결과 카드가 4초 뒤 자동으로 닫힘. 로그인 카드는 자동으로 닫히지 않는다 |

`card_state`는 닫힐 때 보이던 카드(`success`, `login_required`, `failure`)다. 결과가 나오기 전에 닫히면 `none`이다.

- `action_clicked`는 버튼(`action`)마다 공유 건당 한 번 기록한다. 로그인 → 앱 열기 실패 → 닫기처럼 한 공유에서 여러 개가 남을 수 있다.
- `card_dismissed`는 공유 건당 처음 닫힌 방법 하나만 기록한다.
- iOS는 앱 열기 결과를 OS가 1초 안에 알려 주지 않으면 `opened`로 본다.
- Android 뒤로 가기, 시트를 스와이프로 내린 경우, OS가 확장을 종료한 경우는 닫힘이 기록되지 않는다.

**자주 보는 질문**
- 성공 카드에서 앱으로 갔는지·껐는지·방치했는지: `card_dismissed`를 `card_state=success`로 거르고 `method`로 나눈다.
- 로그인 카드에서 앱으로 갔는지 나갔는지: `card_state=login_required`로 거른다. `app_opened`는 앱으로 이동, `tap_outside`는 이탈이다. 앱에서 실제로 로그인했는지는 [5.1](#51-진입과-로그인)의 `entry=share_login_handoff`로 이어서 본다.

## 3. 전송과 추출 처리 (네이티브)

공유 화면이 닫힌 뒤 기기가 링크를 보관하고 API로 보내는 과정이다. iOS는 background URLSession, Android는 WorkManager(`ShareSaveWorker`)가 처리한다.

| 이벤트 | 발생 기준 | 속성 |
| --- | --- | --- |
| `share_local_save_resolved` | 링크 검증과 기기 보관 결과 | `outcome` |
| `share_delivery_status_changed` | 전송 대기 사유가 바뀌거나 작업이 등록됨 | `delivery_status=deferred/queued`, 대기일 때 `reason` |
| `extraction_request_started` | 기기가 분석 API 요청 본문 전송을 시도함 | — |
| `extraction_request_finished` | 응답을 확인했거나 최종 실패함 | `outcome`, 선택 `response_status`, `failure_type`, `content_id` |

**`share_local_save_resolved.outcome`**

| 값 | 의미 |
| --- | --- |
| `saved` | 기기에 링크를 보관함 (일반 공유, 로그인 핸드오프) |
| `invalid_link` | 릴스·게시물 링크가 아님 |
| `storage_failed` | 기기 보관 실패 |
| `guest_practice_success` | 가입 전 체험 게시물 공유 |

전송 등록 전, 기기에 보관한 직후에 기록한다. 🆕 Android의 일반 공유 `saved`/`storage_failed`는 다음 스토어 빌드부터 기록된다. 그 이전 Android 버전에는 로그인 핸드오프의 `saved`, `invalid_link`, `guest_practice_success`만 있으므로, 플랫폼을 합쳐 보관 성공률을 계산할 때는 새 버전만 쓴다.

**`share_delivery_status_changed`의 대기 사유(`reason`)**: `login_required`, `auth_pending`, `network_unavailable`, `queue_registration_failed`. 사유가 바뀌거나 `queued`가 되면 이벤트가 새로 생긴다. 대기는 최종 실패가 아니며, 인증 문제가 풀리면 같은 `share_id`로 다시 전송한다.

**`extraction_request_finished.outcome`**
- `response_received`: 2xx 응답에서 `reelId`를 받음. `content_id`가 붙는다.
- `request_failed`: 최종 실패. `failure_type`이 붙는다.
- `blocked_before_request`: Android 작업이 요청 전에 로그인이 필요하다는 걸 확인함(`failure_type=auth_failed`).

**`failure_type`**
| 값 | 의미 |
| --- | --- |
| `auth_failed` | 401, 403 |
| `timeout` | 408, 504, 요청 시간 초과 |
| `server_error` | 그 밖의 5xx |
| `invalid_request` | 그 밖의 4xx |
| `network_error` | 네트워크 오류 |
| `invalid_response` | 2xx인데 `reelId`가 없거나 응답을 해석하지 못함 |
| `interrupted` | Android만. 요청 중 작업이 끊겨 재개할 수 없음 |

`response_received`는 요청이 접수됐다는 뜻이다. 장소 추출의 최종 성공·실패는 히스토리 화면의 `visible_state`로 본다.

## 4. 네이티브 이벤트가 PostHog에 도착하는 경로

1. 공유 확장과 기기 작업은 이벤트를 앱 그룹(iOS)이나 SharedPreferences(Android)에 쌓는다.
2. 네이티브가 PostHog `/i/v0/e/`로 직접 올린다. 앱을 한 번도 열지 않았어도 시도한다. 설정 값은 iOS 확장의 Info.plist, Android 빌드 설정에서 읽고, 앱을 열어 동기화한 값이 있으면 그걸 우선한다.
3. 앱을 열면 [`posthog-share.ts`](../../src/lib/share-intent/posthog-share.ts)가 남은 이벤트를 다시 보낸다.
4. 각 단계에 허용 목록이 있다. 이벤트나 속성을 추가할 때는 세 곳을 모두 고친다.
   - iOS `ShareAnalyticsStore.allowedProperties`
   - Android `ShareAnalyticsStore.eventProperties`
   - JS `SHARE_EXTRACTION_EVENTS` / `EVENT_KEYS`

> ⚠️ **2.2.1까지의 누락:** 2.2.1까지는 3번 앱 재전송에서 `reel_share_outcome_viewed`를 보내지 않고 지웠다. #312 때 아직 정식 이벤트가 아니어서 큐를 비우려고 넣은 코드가, #395에서 정식 이벤트로 바뀐 뒤에도 남아 있었다. 그래서 그 버전에서는 네이티브 직접 업로드가 실패한 건의 `outcome_viewed`만 빠져, `feedback_viewed`보다 적게 잡힐 수 있다. 🆕 다음 빌드부터는 다른 이벤트처럼 다시 보낸다.

## 5. 앱 이벤트

이름은 [`src/analytics/eventNames.ts`](../../src/analytics/eventNames.ts)에 있고 `__tests__/analyticsEventNames.test.ts`로 고정되어 있다. 이름을 바꾸면 Funnel과 대시보드가 끊긴다.

### 5.1 진입과 로그인

| 이벤트 | 발생 기준 | 속성 | 기록 위치 |
| --- | --- | --- | --- |
| `app_opened` | 앱을 열고 로그인 상태가 확인됨 | `is_logged_in` | `App.tsx` |
| `login_started` | 소셜 로그인 버튼을 누름 | `provider=apple/kakao/google`, 🆕 `entry`, `share_id` | `App.tsx` |
| `login_finished` | 로그인이 성공·실패로 끝남 | `provider`, `outcome=success/failure`, `failure_type`, 🆕 `entry`, `share_id` | `App.tsx` |

- `login_started`는 버튼을 누른 시점에 기록하므로, 로그인 준비 단계에서 실패해도 시도로 센다.
- `failure_type`: `user_cancelled`, `auth_failed`, `network_error`, `app_return_failed`(인증 후 앱 복귀 처리 실패, `CLIENT000_003`), `unknown`.
- 🆕 **공유에서 온 로그인:** 공유 카드의 [로그인]으로 앱이 열려 로그인 화면에 왔으면 `entry=share_login_handoff`와 그 공유의 `share_id`가 붙는다.
  - 로그인 카드 → 앱 이동(`card_dismissed`의 `method=app_opened`) → 로그인 시도 → 성공을 `share_id`로 잇는다.
  - 공유 이벤트와 앱 이벤트의 `distinct_id`가 다를 수 있으니 Funnel보다 `share_id` 기준 HogQL로 집계한다.
  - 이 값은 로그인 성공, 다른 경로로 로그인 화면 진입(둘러보기·마이페이지·로그인 필요 안내·공유 저장 401), 공유 로그인 취소, 로그아웃 때 지운다. 로그인에 실패해 다시 시도하면 유지된다.
  - 로그인 화면에 왔다가 아무것도 누르지 않고 나가면 로그인 이벤트가 없다. 화면 진입 자체는 `screen_viewed`(`screen_name=login`)에 남지만 `entry`는 붙지 않는다.
- 비회원 예시 장소는 로그인 계정으로 옮기지 않는다. `has_guest_transfer`와 `guest_transfer_finished`는 더 이상 기록하지 않는다.

### 5.2 히스토리

기록 위치: [`HistoryScreen.tsx`](../../src/pages/history/HistoryScreen.tsx)

| 이벤트 | 발생 기준 | 속성 |
| --- | --- | --- |
| `history_viewed` | 첫 목록 조회 결과가 표시됨 | `view_state=list/empty/error` |
| `history_content_viewed` | 카드의 절반 이상이 0.5초 이상 보임 | `content_id`, `visible_state=loading/processing/success/failed` |
| `history_content_detail_viewed` | 성공 또는 실패 상세 화면을 엶 | `content_id`, `result=success/failed` |

- 카드 노출은 화면 방문 한 번 동안 콘텐츠와 표시 상태 조합당 한 번만 센다.
- `success`/`failed`는 결과 배지가 보였다는 뜻이고, 사용자가 내용을 이해했다는 뜻은 아니다.

**히스토리에서 다시 시도한 추출:** 같은 `extraction_request_started` / `extraction_request_finished`를 쓰고 `source=history_retry`로 구분한다.
- `share_id` 대신 API의 `clientRequestId`와 같은 `request_id`로 시작과 종료를 잇는다.
- `outcome=response_received/request_failed`이고, 응답을 받으면 `content_id`, 실패하면 `failure_type`과 `response_status`가 붙는다.
- 2xx 응답에 `FAILED` 상태가 담겨 있어도 `response_received`다.
- 공유 건 기준 지표에서는 `share_id`가 있는 이벤트만 센다.

### 5.3 장소 활용

기록 위치: [`SavedPlacesScreen.tsx`](../../src/pages/saved-places/SavedPlacesScreen.tsx), `SavedPlacesSearchPanel.tsx`, `MapScreen.tsx`, `PlaceResultSheet.tsx`, `PlaceDetailScreen.tsx`, `PlaceInfo.tsx`

| 이벤트 | 발생 기준 | 속성 |
| --- | --- | --- |
| `saved_places_viewed` | 보관함 목록을 확인함 | `place_count`, `has_places`, `entry_type=direct/after_save` |
| `saved_places_search_submitted` | 보관함 검색 결과가 표시됨 | `search_id`, `search_method=keyboard/recent_search`, `result_count`, `has_result` |
| `saved_place_selected` | 목록·검색·지도에서 장소를 선택함 | `place_id`, `saved_place_id`, `place_view_id`, `source`, `search_id`, `position` |
| `saved_place_opened` | 장소 상세가 열림 | `place_view_id`, `source`, `is_revisit`, `days_since_saved_bucket` |
| `place_map_viewed` | 상세에서 카카오맵 바로가기를 실행함 | `place_view_id`, `source`, `map_provider=kakao`, `is_revisit` |

- `source`: `saved_places_grid`, `saved_places_search`, `map_marker`, `map_search_result`.
- 한 번의 장소 탐색은 `place_view_id`로 선택 → 상세 → 지도를 잇는다.
- `days_since_saved_bucket`: `same_day`, `1_day`, `2_7_days`, `8_30_days`, `31_plus_days`. 저장하고 24시간 이상 지나 같은 장소를 다시 열면 `is_revisit=true`다.

## 6. 공유 이벤트 명세 전환 상태

공유 흐름은 새 명세(접수 안내 → API 요청 → 추출 결과)로 옮기는 중이다. 과거 데이터와 대시보드가 끊기지 않도록 새 이벤트를 **같이** 기록하고, 대시보드를 옮긴 뒤 기존 이벤트를 지운다.

| 새 명세 이벤트 | 상태 |
| --- | --- |
| `reel_share_received` | 기존 이벤트를 그대로 사용 |
| `reel_share_outcome_viewed` | 기록 중. 2.2.1까지는 앱 재전송 경로에서 일부가 빠졌다(4장) |
| `extraction_request_started` | 기존 이벤트를 그대로 사용 |
| `extraction_request_finished` | 기존 이벤트에 `blocked_before_request`를 추가해 사용. 선택 속성 `attempt_count`는 미구현 |
| `extraction_result_resolved` | **미구현.** 서버가 `clientRequestId`와 최종 결과를 이어서 기록해야 한다 |

옮긴 뒤 지울 기존 이벤트는 `reel_share_feedback_viewed`, `share_local_save_resolved`, `share_delivery_status_changed`다. 아직 지우지 않았다. `outcome_viewed`가 처음 수집된 버전 이전 기간에는 새 이벤트 데이터가 없다.

## 7. 비활성 이벤트 (대기함)

대기함 화면이 제거되어(#379, #389, #390) 아래 이벤트는 현재 호출되는 곳이 없다. 이름과 함수(`src/analytics/placeSavingEvents.ts`)는 대기함을 되살릴 때를 위해 남겨 두었다. Funnel·대시보드·지표에 쓰지 않는다.

`pending_places_viewed`, `pending_place_save_finished`, `pending_place_discard_finished`, `pending_resolution_completed`

## 8. 해석할 때 주의할 점

1. 공유 단계별 건수는 고유 `share_id`로 세고, PostHog 도착 순서가 아니라 이벤트 발생 시각으로 정렬한다. 네이티브 이벤트는 네트워크와 OS 실행 정책 때문에 늦게 도착할 수 있다.
2. `extraction_request_started`는 기기가 전송을 시도했다는 뜻이다. 서버가 실제로 받았는지, 앱을 열지 않은 사용자의 최종 추출 결과가 무엇인지는 백엔드 계측 없이는 알 수 없다.
3. `content_id`가 없는 요청 실패는 히스토리 항목과 이을 수 없다. 같은 콘텐츠를 여러 번 공유했다면 히스토리 열람을 특정 `share_id` 하나에 귀속하지 않는다.
4. 공유 이벤트와 앱 이벤트는 `distinct_id`가 다를 수 있다. 사람 단위로 이을 때는 `installation_id`, 공유 건 단위로 이을 때는 `share_id`를 쓴다.
5. 첫 실행 전에는 로그인 세션과 API 주소 설정이 없을 수 있다(iOS는 앱이 `setApiConfiguration`으로 전달). 이 경우 공유는 `deferred`로 대기한다.
6. `installation_id`는 로그아웃해도 유지되고, 앱 데이터를 지우거나 재설치하면 새로 생긴다. 이미 수집된 이벤트에 소급되지 않으며, 저장소에 접근하지 못한 이벤트에는 빠질 수 있다.
