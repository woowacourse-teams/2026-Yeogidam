# 공유부터 히스토리까지의 PostHog 계측 계약

Android와 iOS의 공유 화면, 기기 전송 작업, 앱 히스토리에 적용한다. 기존 앱 진입·로그인 이벤트는 유지한다. 이 문서의 이벤트는 사용자가 실제로 본 경험과 기기에서 진행된 처리 상태를 구분한다.

## ID와 연결

- `share_id`: 공유 화면에 들어온 한 번의 시도. 모든 네이티브 공유 이벤트의 속성에 유지한다.
- `installation_id`: 앱 설치본에 생성하는 UUID. 앱 이벤트와 네이티브 공유 이벤트에 공통으로 넣는다. 앱을 열기 전에 공유 확장이 먼저 실행돼도 그쪽에서 ID를 만들고, 나중에 앱이 같은 ID를 읽는다. 로그인 여부와 무관한 이벤트 필터용 속성이며 PostHog `distinct_id`를 대체하지 않는다.
- 네이티브 공유 이벤트는 첫 이벤트 기록 시점에 저장된 로그인 세션의 `userId`가 있으면 이를 PostHog `distinct_id`로 쓴다. 세션이 없으면 `share_id`를 `distinct_id`로 쓰고 프로필 생성은 끈다. 한 공유 건에서는 처음 정한 ID를 이후 상태 이벤트에도 유지하므로 토큰 갱신이나 전송 지연으로 ID가 바뀌지 않는다.
- `content_id`: 히스토리의 콘텐츠 항목 ID. API 응답의 `reelId`를 계측 시 `content_id`로 변환한다. API 필드명과 저장 모델의 `reelId`는 변경하지 않는다.
- 여러 공유 시도가 같은 `content_id`를 가리킬 수 있다. 2xx 응답에서 `reelId`를 받은 건은 `extraction_request_finished`의 `share_id`와 `content_id`로 연결할 수 있다. 로그인 세션이 있는 공유 이벤트는 앱의 사용자 ID와 같아 사용자 기준으로 분석할 수 있다. 세션이 없는 공유 이벤트는 사용자에게 자동 연결되지 않는다. 응답을 못 받은 공유나 히스토리 목록만 조회한 건은 공유 건과 콘텐츠를 확실히 연결할 수 없다.

URL, 공유 텍스트, 토큰, 오류 메시지 원문은 PostHog에 보내지 않는다. 네이티브 공유 이벤트에는 `share_id`, `platform`, `release`, `environment`, 가능한 경우 `installation_id`와 발생 시각을 포함한다. 앱 SDK의 자동 이벤트에도 `environment`와 가능한 경우 `installation_id`를 포함한다. 로컬 앱은 `.env`의 `APP_ENV`를 사용하고, 값이 없으면 `development`로 기록한다. 내부 스토어 배포와 공개 앱 모두 `APP_ENV=production`을 사용한다. 이 속성은 실행 환경 필터이며 내부 배포 여부를 뜻하지 않는다.

앱 이벤트에는 로그인 상태가 확정된 뒤 `is_guest`(비회원이면 `true`)가 공통 속성으로 붙는다. 인증 상태를 확인하기 전에는 이 속성이 없다. 비회원 체험용 예시 콘텐츠(`ONBOARDING_SAMPLE_IDS`: 예시 릴스와 예시 장소)에 대한 `history_content_viewed`, `history_content_detail_viewed`, `saved_place_selected`, `saved_place_opened`, `place_map_viewed`는 보내지 않는다. 운영 지표를 볼 때는 Funnel에 `is_guest` 필터를 함께 건다.

내부 테스터를 운영 지표에서 제외할 때는 `environment=production`으로 조회한 뒤, 테스터의 `installation_id` **또는** 로그인 계정의 `distinct_id`에 해당하는 이벤트를 제외한다. 설치 ID는 비로그인 앱·공유 이벤트를, 사용자 ID는 로그인 이후 다른 설치본까지 구분한다. 한 설치본을 여러 사람이 함께 쓰면 그 설치본의 이벤트가 모두 제외된다. 테스터 설치 ID는 처음 발생한 앱 또는 공유 이벤트에서 확인해 목록에 등록해야 하므로, 등록 전 첫 비로그인 공유는 자동으로 테스터라고 알 수 없다.

## 사용자 경험 이벤트

| 이벤트 | 발생 기준 | 속성 |
| --- | --- | --- |
| `reel_share_received` | 여기담 공유 화면이 열리고 이번 공유 ID가 생성됨 | `share_id` |
| `reel_share_feedback_viewed` | 최종 안내 문구가 공유 화면에 표시됨 | `share_id`, `feedback_type=received/invalid_link/save_failed` |
| `reel_share_outcome_viewed` | 접수·로그인 필요·실패 안내가 공유 화면에 표시됨 (새 명세) | `share_id`, `outcome=accepted/login_required/failed`, `reason` |
| `history_viewed` | 첫 목록 조회 결과가 목록·빈 화면·오류로 표시됨 | `view_state=list/empty/error` |
| `history_content_viewed` | 카드의 절반 이상이 화면 영역에 0.5초 이상 표시됨 | `content_id`, `visible_state=loading/processing/success/failed` |
| `history_content_detail_viewed` | 성공 또는 실패 상세 화면을 엶 | `content_id`, `result=success/failed` |

공유 화면은 기기에 링크가 저장되면 인증·네트워크 대기 여부와 무관하게 같은 접수 안내를 보여준다. 그래서 `feedback_type`에 보이지 않은 로그인 상태를 넣지 않는다. 카드 노출은 화면 방문 동안 콘텐츠와 표시 상태 조합당 한 번만 센다. `success/failed`는 결과 배지가 보인 사실이며, 사용자가 내용을 이해했다는 뜻은 아니다.

## 처리 상태 이벤트

| 이벤트 | 발생 기준 | 속성 |
| --- | --- | --- |
| `share_local_save_resolved` | URL 검증과 기기 보관 완료 | `share_id`, `outcome=saved/invalid_link/storage_failed` |
| `share_delivery_status_changed` | API 전송 전 대기 사유가 바뀌거나 작업 등록됨 | `share_id`, `delivery_status=deferred/queued`, 대기 시 `reason` |
| `extraction_request_started` | 기기가 분석 API 요청의 본문 전송을 시도함 | `share_id` |
| `extraction_request_finished` | 응답을 확인하거나 재시도 후 최종 실패 | `share_id`, `outcome=response_received/request_failed/blocked_before_request`, 선택적 `response_status`, `failure_type`, `content_id` |

`deferred.reason`은 `login_required`, `auth_pending`, `network_unavailable`, `queue_registration_failed` 중 하나다. 같은 공유 건이 다른 사유로 다시 대기하거나 `queued`로 바뀌면 상태 변경을 별도 이벤트로 기록한다. 대기는 최종 실패가 아니다. 인증 문제가 해결되면 같은 `share_id`로 다시 전송한다.

`extraction_request_finished.failure_type`은 최종 요청 실패에만 쓰며 `auth_failed`, `timeout`, `network_error`, `server_error`, `invalid_request` 중 하나다. `response_received`는 기기가 2xx 응답을 받았다는 뜻이다. 장소 추출의 최종 성공이나 실패는 히스토리의 `processing_status`가 화면에 표시될 때 사용자 경험 이벤트로 확인한다.

## 앱 화면 이벤트

앱이 직접 기록하는 이벤트다. 모든 이벤트에 `platform`, `release`, `environment`가 붙고, 로그인 상태가 확정된 뒤에는 `is_guest`도 붙는다. 이름은 `src/analytics/eventNames.ts`에서 관리하며 `__tests__/analyticsEventNames.test.ts`가 고정한다. 이름을 바꾸면 기존 Funnel과 대시보드가 끊기므로, 바꿀 때는 이 문서와 대시보드를 함께 고친다.

| 영역 | 이벤트 | 발생 기준 | 주요 속성 |
| --- | --- | --- | --- |
| 진입 | `app_opened` | 앱을 열고 로그인 상태가 확인됨 | `is_logged_in` |
| 진입 | `login_started` | 로그인 버튼을 누름 | `provider` |
| 진입 | `login_finished` | 로그인이 성공·실패로 끝남 | `provider`, `outcome`, `failure_type`, `has_guest_transfer` |
| 진입 | `guest_transfer_finished` | 비회원 체험 데이터 이전이 끝남 | `outcome` |
| 활용 | `saved_places_viewed` | 보관함 목록을 확인함 | `place_count`, `has_places`, `entry_type=direct/after_save` |
| 활용 | `saved_places_search_submitted` | 보관함 검색 결과가 표시됨 | `search_id`, `search_method=keyboard/recent_search`, `result_count`, `has_result` |
| 활용 | `saved_place_selected` | 목록·검색·지도에서 장소를 선택함 | `place_id`, `saved_place_id`, `place_view_id`, `source`, `search_id`, `position` |
| 활용 | `saved_place_opened` | 장소 상세 화면이 열림 | `place_view_id`, `source`, `is_revisit`, `days_since_saved_bucket` |
| 활용 | `place_map_viewed` | 상세에서 카카오맵 바로가기를 실행함 | `place_view_id`, `source`, `map_provider=kakao`, `is_revisit` |

- `source`는 `saved_places_grid`, `saved_places_search`, `map_marker`, `map_search_result` 중 하나다. 한 번의 장소 탐색은 `place_view_id`로 선택 → 상세 → 지도를 연결한다.
- `days_since_saved_bucket`은 `same_day`, `1_day`, `2_7_days`, `8_30_days`, `31_plus_days`다. 저장 후 24시간 이상 지나 같은 장소를 다시 열면 `is_revisit=true`다.
- 검색어 원문, 장소명, 주소, 좌표는 속성에 넣지 않는다.
- 비회원 체험용 예시 장소·콘텐츠에 대한 이벤트는 보내지 않는다. 자세한 규칙은 위 `is_guest` 설명을 따른다.

## 로그인과 비회원 데이터 이전

- `login_started`는 로그인 버튼을 누른 시점에 기록한다. 비회원 데이터 이전 준비 같은 시작 전 단계가 실패해도 `login_finished(outcome=failure)`와 짝이 맞는다.
- `login_finished.failure_type`은 `user_cancelled`, `auth_failed`, `network_error`, `app_return_failed`, `unknown` 중 하나다. 인증 후 앱으로 돌아온 응답을 처리하지 못한 경우(`CLIENT000_003`)는 `app_return_failed`, 분류할 수 없는 오류는 `unknown`이다.
- `login_finished.has_guest_transfer`는 비회원 체험 데이터를 이어받는 로그인이면 `true`다.
- 이전 결과는 `login_finished`에 담을 수 없다. 이전은 로그인 직후가 아니라 군자역 게시물 추출이 끝날 때까지 이어지고, 앱을 다시 열어 재시도하기도 하기 때문이다. 그래서 `guest_transfer_finished(outcome=success/failure)`를 따로 기록한다. 옮길 데이터가 없던 경우는 기록하지 않으며, 실패 후 재시도하면 시도마다 기록한다.

## 앱에서 직접 시작한 추출 요청

공유 확장이 아니라 앱 화면에서 분석 API를 호출하는 경로는 같은 `extraction_request_started` / `extraction_request_finished` 이벤트를 쓰되 `source`로 구분한다. 이 이벤트에는 `share_id`가 없고, API의 `clientRequestId`와 같은 값을 `request_id`로 넣어 시작과 종료를 연결한다. 공유 건 기준 지표는 `share_id`가 있는 이벤트만 센다.

| `source` | 발생 위치 | 비고 |
| --- | --- | --- |
| `history_retry` | 히스토리에서 실패한 항목을 다시 시도함 | `outcome=response_received/request_failed`, 응답을 받으면 `content_id`, 실패하면 `failure_type`, `response_status` |

`failure_type`은 `auth_failed`, `timeout`, `network_error`, `server_error`, `invalid_request` 중 하나다. 2xx 응답에 `FAILED` 상태가 담겨 있어도 `response_received`로 기록한다.

## 새 명세로의 단계적 전환

공유 흐름을 새 명세(접수 안내 → API 요청 → 추출 결과)의 5개 이벤트로 옮기는 중이다. 기존 이벤트를 바로 지우면 과거 데이터와 단절되고 대시보드가 깨지므로, 새 이벤트를 먼저 **같이** 기록하고 대시보드를 옮긴 뒤 기존 이벤트를 제거한다.

| 새 명세 이벤트 | 현재 상태 | 비고 |
| --- | --- | --- |
| `reel_share_received` | 기존 이벤트 그대로 사용 | |
| `reel_share_outcome_viewed` | **추가됨** (Android·iOS) | `outcome=accepted/login_required/failed`, `reason` |
| `extraction_request_started` | 기존 이벤트 그대로 사용 | |
| `extraction_request_finished` | 기존 이벤트 사용, `blocked_before_request` 추가 | Android 작업이 접수 뒤 로그인 필요를 확인한 경우. 선택 속성 `attempt_count`는 미구현 |
| `extraction_result_resolved` | **미구현** | 서버가 `clientRequestId`와 최종 결과를 연결해 기록해야 함 |

`reel_share_outcome_viewed`는 공유 화면에 실제 표시된 안내 기준이다.

| `outcome` | `reason` | 표시한 안내 |
| --- | --- | --- |
| `accepted` | 없음 | 접수 안내 |
| `login_required` | `no_session`(세션이 처음부터 없음), `refresh_token_missing`, `refresh_token_invalid` | 로그인 필요 안내 |
| `failed` | `invalid_link`, `save_failed` | 링크 확인·저장 실패 안내 |

- 가입 전 체험 게시물 공유는 실제 추출 요청이 아니므로 이 이벤트를 기록하지 않는다.
- 현재 앱은 링크만 저장되고 후속 전송 등록이 실패해도 접수 안내를 보여준다. 이때도 `accepted`로 기록된다. 이 불일치는 흐름 통일(후속 처리 등록을 확인한 뒤 접수 안내 표시)에서 해결한다.
- 기존 `reel_share_feedback_viewed`, `share_local_save_resolved`, `share_delivery_status_changed`는 새 이벤트 기반 대시보드로 옮긴 뒤 제거한다. **전환 시점은 `reel_share_outcome_viewed`가 처음 수집된 앱 버전부터이며, 이전 기간에는 이 이벤트가 없다.**

## 비활성 이벤트 (대기함)

대기함 화면이 제거되어(#379, #389, #390) 아래 이벤트는 **현재 앱에서 발생하지 않는다.** 대기함을 복원할 때 다시 쓰려고 `src/analytics/placeSavingEvents.ts`와 `src/pages/inBox/inBoxScreen.tsx`는 남겨 둔다.

| 이벤트 | 원래 발생 기준 | 상태 |
| --- | --- | --- |
| `pending_places_viewed` | 대기함 화면을 확인함 | 비활성 |
| `pending_place_save_finished` | 대기함 장소 하나의 저장이 성공·실패로 끝남 | 비활성 |
| `pending_place_discard_finished` | 대기함 장소 하나의 삭제가 성공·실패로 끝남 | 비활성 |
| `pending_resolution_completed` | 대기함에서 저장 또는 삭제 처리를 완료함 | 비활성 |

- 이 이벤트들은 Funnel, 대시보드, 지표 계산에 사용하지 않는다. 비활성화 이전에 수집된 데이터만 남아 있다.
- 대기함을 복원하면 이 표에서 상태를 갱신하고, 그때 `content_id` 등 속성이 현재 기준과 맞는지 다시 확인한다.

## 해석과 한계

1. 공유 시도 → 기기 보관 → 전송 대기 → 작업 등록 → 실제 요청 → 응답 순서의 건수는 고유 `share_id`로 계산한다. PostHog 도착 순서보다 이벤트 발생 시각을 사용한다.
2. PostHog 설정을 포함해 빌드한 앱에서는 Android WorkManager와 iOS background URLSession이 앱을 한 번도 열지 않았어도 공유 이벤트 업로드를 시도한다. Android는 빌드 설정, iOS 공유 확장은 자체 Info.plist의 PostHog 설정을 읽는다. 베타 iOS 아카이브에는 배포 워크플로가 이 값을 주입하고, 로컬 Xcode 빌드는 공유 확장의 xcconfig가 `.env`를 읽는다. 앱을 열어 동기화한 설정이 있으면 이를 우선한다. 네트워크·OS 실행 정책에 따라 업로드가 지연될 수 있으며, 앱을 열면 남은 네이티브 이벤트를 다시 전송한다. 첫 실행 전에는 로그인 세션과 API 주소 설정(iOS는 앱이 `setApiConfiguration`으로 전달)이 없을 수 있으므로 API 요청은 대기할 수 있다.
3. `extraction_request_started`는 기기의 전송 시도다. 서버가 요청을 실제 수신한 사실과 앱을 열지 않은 상태의 최종 장소 추출 결과는 백엔드 계측 없이는 알 수 없다.
4. `content_id`가 없는 요청 실패는 히스토리 항목과 연결하지 않는다. `content_id`가 있어도 같은 콘텐츠를 여러 번 공유했다면 히스토리 열람을 특정 `share_id` 하나에 귀속하지 않는다.
5. `installation_id`는 Android의 백업 제외 앱 파일과 iOS 앱 그룹의 백업 제외 파일에 보관한다. 로그아웃해도 유지되고 앱 데이터를 지우거나 삭제 후 다시 설치하면 새 값이 생긴다. 재설치한 테스터는 새 설치 ID를 목록에 등록해야 한다. 저장소에 접근할 수 없는 이벤트에는 이 속성이 빠질 수 있다. 이미 수집된 이벤트에는 소급 적용되지 않는다.
