# PostHog UI 이벤트 사전

앱 안의 화면 진입, 버튼, 기능 결과를 기록하는 이벤트 목록입니다. 코드는 `src/analytics/uiEvents.ts`에 있고,
이벤트 이름은 `__tests__/analyticsEventNames.test.ts`로 고정되어 있습니다(퍼널과 대시보드가 이름에 의존합니다).
공유 확장과 저장·추출 흐름의 기존 이벤트는 [`SHARE_AND_HISTORY_EVENTS.md`](./SHARE_AND_HISTORY_EVENTS.md)를 참고하세요.

## 설계 원칙

- 이벤트 종류는 적게 두고, 어느 화면의 어떤 버튼인지는 속성으로 구분합니다. 새 버튼이 생겨도 이벤트 이름이 늘지 않습니다.
- 모든 이벤트에는 `platform`, `release`, `environment`, (로그인 상태가 확정되면) `is_guest`가 공통으로 붙습니다.
- 장소명, 검색어, 이메일 같은 개인 정보와 자유 입력 텍스트는 속성에 넣지 않습니다. 검색어는 길이만 보냅니다.
- 새 버튼을 추가할 때는 컴포넌트에서 `useScreenAnalytics('화면_이름')`을 호출해 `button('버튼_이름')`을 부릅니다.
  여러 화면이 같이 쓰는 컴포넌트는 `AnalyticsScreenContext`로 화면 이름을 받습니다.

## 이벤트 종류

| 이벤트 | 의미 | 주요 속성 |
|---|---|---|
| `screen_viewed` | 화면 진입 | `screen_name` |
| `button_pressed` | 버튼, 링크, 아이콘 탭 | `screen_name`, `button_name` |
| `selection_changed` | 탭, 필터, 모드 변경 | `screen_name`, `selection_name`, `value` |
| `modal_viewed` | 다이얼로그, 시트, 확인창 노출 | `screen_name`, `modal_name` |
| `step_viewed` | 온보딩과 가이드의 단계 노출 | `flow_name`, `step_index`, `step_count` |
| `list_refreshed` | 당겨서 새로고침 | `screen_name` |
| `map_search_submitted` | 지도 검색 제출 | `result_count`, `has_result`, `query_length` |
| `action_finished` | 기능의 성공/실패 결과 | `action_name`, `outcome`(`success`/`failure`), `failure_type` |

## screen_viewed의 screen_name

`splash`, `onboarding`, `login`, `email_login`, `signup`, `terms`, `saved`, `map`, `history`, `my`, `detail`,
`app_guide`, `account_deletion`. `App.tsx`에서 한 곳에 연결되어 있습니다.

## 버튼별 button_pressed

### 공통

| screen_name | button_name | 비고 |
|---|---|---|
| 현재 탭 (`saved`/`map`/`history`/`my`) | `bottom_tab` | `target_tab`, `is_same_tab` |
| 현재 화면 | `swipe_back` | 스와이프 뒤로가기 |
| `guest_login_prompt` | `login`, `continue_browsing` | 노출은 `modal_viewed`(`guest_login_prompt`) |
| `app_update_required`, `app_update_recommended` | `update`, `dismiss` | 노출은 `modal_viewed`(`app_update`). 필수 업데이트에는 `dismiss`가 없음 |
| `onboarding`, `app_guide` | `next`, `previous`, `complete` | `step_index`, `step_count`. 단계 노출은 `step_viewed` |

### 로그인과 약관

| screen_name | button_name |
|---|---|
| `login` | `browse_as_guest`, `terms`, `contact`, `close` |
| `email_login` | `close`, `submit`, `signup`, `terms` |
| `signup` | `close`, `submit`, `email_login`, `terms` |
| `terms` | `back` |

소셜 로그인 버튼은 기존 `login_started`, `login_finished`가 기록하므로 `button_pressed`를 따로 보내지 않습니다.
`email_login`, `signup` 화면은 현재 앱 흐름에서 열리지 않습니다.

### 마이페이지와 계정

| screen_name | button_name | 비고 |
|---|---|---|
| `my` | `guide`, `terms`, `contact`, `withdraw`, `logout` | 설정 항목 |
| `my` | `login`, `retry_profile`, `reauthenticate`, `edit_profile` | 프로필 영역 |
| `account_deletion` | `back`, `delete_account` | `provider` |
| `profile_edit` | `back`, `save` | `changed_fields`. 현재 앱 흐름에서 열리지 않음 |

### 보관함 (`saved`)

| 구분 | button_name |
|---|---|
| 링크 추가 | `add_link`, `link_dialog_close`, `link_dialog_submit` (입력창 노출은 `modal_viewed`: `link_dialog`) |
| 편집 | `edit_start`, `edit_cancel`, `edit_long_press`, `toggle_place_selection` |
| 삭제 | `delete_selected`, `delete_confirm_cancel`, `delete_confirm_ok` (확인창 노출은 `modal_viewed`: `delete_confirm`) |
| 검색 | `open_search`, `close_search` |
| 기타 | `scroll_to_top`, `retry_load_banner`, `retry_load`, `retry_delete`, `empty_login`, `empty_open_guide` |

`selection_changed`: `category_filter`. `list_refreshed`: 당겨서 새로고침.

### 지도 (`map`)

| 구분 | button_name |
|---|---|
| 지도 위 | `current_location`(`permission_granted`), `search_back`, `guest_search`, `close_message` |
| 시트 | `toggle_sheet` |
| 폴더 | `open_folder`, `close_folder`, `create_folder`, `folder_actions`, `folder_delete_confirm`, `folder_delete_cancel` |
| 장소 삭제 | `delete_confirm_cancel`, `delete_confirm_ok` |

`modal_viewed`: `folder_limit_reached`, `folder_delete_confirm`, `delete_confirm`.
`selection_changed`: `category_filter`, `sheet_mode`(장소/폴더 전환).
`map_search_submitted`: 검색 제출. 검색어는 보내지 않습니다.

### 폴더 패널 (`folder_panel`)

| 구성요소 | button_name / 이벤트 |
|---|---|
| 이름 입력창 | `modal_viewed`(`folder_name_dialog`), `select_color`, `name_dialog_cancel`, `name_dialog_submit` |
| 폴더 선택창 | `picker_create_folder`, `picker_toggle_folder` |
| 액션 시트 | `modal_viewed`(`folder_action_sheet`), `action_sheet_edit`, `action_sheet_delete` |
| 폴더 상세 헤더 | `folder_more` |

### 장소 상세

`screen_name`은 상세 화면에서 `place_detail`, 지도 시트 안에서 `map`입니다.

| 구분 | button_name |
|---|---|
| 헤더 | `back`, `folder`, `delete`, `more` |
| 정보 | `copy_address`, `open_kakao_map` |
| 전화 | `call`, `call_confirm`, `call_cancel` (확인창 노출은 `modal_viewed`: `call_confirm`) |
| 게시물 | `open_instagram_post`, `retry_posts` |

`selection_changed`: `place_tab`(게시물/정보).
`place_detail`에만 있는 것: `folder_picker`(노출), `folder_picker_save`, `folder_picker_cancel`, `folder_create`,
`delete_confirm`(노출), `delete_confirm_cancel`, `delete_confirm_ok`.

### 히스토리

| screen_name | button_name |
|---|---|
| `history` | `back`, `open_item`(`status`: completed/failed), `retry_load`, `retry_load_more`, `empty_login` |
| `history_detail_success` | `back`, `open_original` |
| `history_detail_failure` | `back`, `open_original`, `retry`, `retry_confirm_cancel`, `retry_confirm_ok`, `report`, `report_confirm_cancel`, `report_confirm_ok` |

`modal_viewed`: `retry_confirm`, `report_confirm`. 비회원이 `retry`, `report`를 누르면 `is_guest`가 `true`로 붙고 로그인 화면으로 이동합니다.

## action_finished의 action_name

| action_name | 기록 위치 | 속성 |
|---|---|---|
| `logout` | `App.tsx` | `server_confirmed`, 실패 시 `failure_type` |
| `account_deletion` | `App.tsx` | `server_side_failure`, 실패 시 `failure_type` |
| `profile_edit` | 프로필 수정 | 현재 앱 흐름에서 열리지 않음 |
| `link_save_request` | 보관함 링크 입력 | `source`, `status`, `reused`, 실패 시 `failure_type` |
| `saved_places_delete` | 보관함 | `count`, 실패 시 `failure_type` |
| `saved_place_delete` | 장소 상세, 지도 시트 | `source`(`place_detail`/`map`) |
| `folder_create`, `folder_rename`, `folder_delete` | 지도 | `screen_name` |
| `history_report` | 히스토리 실패 상세 | |

`logout`, `account_deletion`은 PostHog 식별이 초기화되기 전에 기록하도록 순서를 맞춰 두었습니다.

## 이 이벤트 사전에 없는 것

- 기존 이벤트가 이미 있는 동작: 소셜 로그인 버튼, 보관함 검색 제출과 최근 검색어 선택, 장소 선택과 지도 마커 탭.
- 앱에서 열리지 않는 화면: `HomeScreen`, `PlaceDetailActionSheet`.
- 텍스트 입력 자체와 안드로이드 하드웨어 뒤로가기. 입력은 개인 정보 우려로 제외했고, 화면 이동은 `screen_viewed`로 남습니다.
