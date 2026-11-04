# 여기담 PostHog

앱 전체의 PostHog 연동을 한곳에서 정리한다. 어떤 이벤트가 어디서 어떻게 들어오는지, 공통으로 붙는 속성과 사용자 식별 규칙, 이벤트를 추가할 때 고칠 곳을 다룬다. 이벤트별 상세 속성은 아래 상세 문서를 따른다.

| 문서 | 내용 |
| --- | --- |
| 이 문서 | 연동 구조, 식별, 공통 속성, 전체 이벤트 목록, 추가 규칙 |
| [SHARE_AND_HISTORY_EVENTS.md](./SHARE_AND_HISTORY_EVENTS.md) | 공유 화면(네이티브), 전송·추출, 진입·로그인, 히스토리, 장소 활용 이벤트의 상세 속성과 해석 |
| [UI_EVENTS.md](./UI_EVENTS.md) | 범용 UI 이벤트(`screen_viewed`, `button_pressed` 등)와 화면·버튼 이름 사전 |
| [DASHBOARDS.md](./DASHBOARDS.md) | 공유 흐름 대시보드 구성과 SQL |

## 1. 연동 구조

이벤트는 세 경로로 들어온다.

```
┌ 앱 (React Native) ─────────────────────────────────────────┐
│  posthog-react-native SDK                                   │
│   ├ ① SDK 자동 이벤트: 앱 생명주기 (Application *)            │
│   └ ② 앱 이벤트: capture() 헬퍼로 보내는 이벤트               │
│        (진입·로그인, 히스토리, 장소 활용, UI)                  │
└─────────────────────────────────────────────────────────────┘
┌ 공유 확장 / 기기 작업 (iOS Share·Action Extension, Android) ┐
│  ③ 네이티브 공유 이벤트: SDK 없이 /i/v0/e/로 직접 전송         │
│     실패하거나 남은 건은 앱이 열릴 때 posthog-share.ts가 재전송 │
└─────────────────────────────────────────────────────────────┘
```

### SDK 설정 ([`src/app/PostHogRoot.tsx`](../../src/app/PostHogRoot.tsx))

| 항목 | 설정 |
| --- | --- |
| SDK | `posthog-react-native` 4.x |
| 켜는 조건 | `POSTHOG_PROJECT_TOKEN`과 `POSTHOG_HOST`가 둘 다 있을 때만. 하나라도 없으면 SDK를 만들지 않고 이벤트는 조용히 버려진다 |
| 앱 생명주기 이벤트 | 켬 (`captureAppLifecycleEvents`) |
| 화면·터치 자동 수집 | 끔. 화면과 버튼은 직접 보내는 UI 이벤트로 기록한다 |
| 세션 리플레이 | 끔 |
| 설문(Surveys) | 끔 |
| GeoIP | 끔 (`disableGeoip`) |
| Feature flag | 쓰지 않음 |

### 환경 변수

| 변수 | 쓰는 곳 |
| --- | --- |
| `POSTHOG_PROJECT_TOKEN`, `POSTHOG_HOST` | 앱 SDK. 앱이 네이티브 저장소에도 넘겨 공유 확장이 같은 값을 쓴다(`syncShareAnalyticsConfiguration`). 앱을 열기 전에도 보낼 수 있도록 iOS 확장 Info.plist와 Android 빌드 설정에도 빌드 때 넣는다 |
| `APP_ENV` | 모든 이벤트의 `environment` 값. 없으면 `development`. 스토어 배포(내부·공개)는 `production` |

로컬은 `.env`, 베타 빌드는 배포 워크플로가 값을 넣는다([BETA_DEPLOYMENT.md](../BETA_DEPLOYMENT.md)).

## 2. 사용자 식별

| 상황 | `distinct_id` |
| --- | --- |
| 앱, 로그인 전 | SDK가 만든 익명 ID |
| 앱, 로그인 후 | 회원 ID. 앱 시작 때 세션이 있거나 로그인하면 `identify(memberId)` |
| 앱, 로그아웃 | `reset()`으로 새 익명 ID. `logout` 결과 이벤트는 그 전에 보낸다 |
| 네이티브 공유 이벤트 | 기록 시점에 저장된 세션의 회원 ID. 없으면 `share_id`(프로필 생성 안 함). 한 공유 건 안에서는 처음 정한 값을 유지한다 |

공유 이벤트와 앱 이벤트는 `distinct_id`가 다를 수 있다. 설치본 단위로 이을 때는 `installation_id`, 공유 건 단위로 이을 때는 `share_id`를 쓴다.

## 3. 공통 속성

| 속성 | 의미 | ① SDK 자동 | ② 앱 이벤트 | ③ 네이티브 공유 |
| --- | --- | :---: | :---: | :---: |
| `environment` | `APP_ENV` 값 | ○ | ○ | ○ |
| `installation_id` | 설치본 UUID. 재설치하면 바뀜. 백업 제외 | ○ | ○ | ○ |
| `ota_bundle_id` | 적용 중인 OTA 번들 ID. 내장 번들이면 없음 | ○ | ○ | — |
| `platform` | `ios` / `android` | — | ○ | ○ |
| `release` | 앱 버전(예: `2.2.1`) | — | ○ | ○ |
| `is_guest` | 비회원이면 `true`. 로그인 상태 확인 전에는 없음 | — | ○ | — |
| `share_id` | 공유 한 건의 ID | — | 공유에서 온 로그인만 | ○ |

- SDK 자동 이벤트에는 PostHog 기본 속성(`$os`, `$app_version` 등)이 대신 붙는다.
- `environment`, `installation_id`, `ota_bundle_id`는 SDK의 `before_send`가 붙이고, `platform`, `release`, `is_guest`는 `capture()` 헬퍼([`analytics.ts`](../../src/analytics/analytics.ts))가 붙인다.
- `ota_bundle_id`는 Sentry 태그와 같은 값이라, 특정 OTA 번들 이후의 지표 변화를 볼 때 쓴다.

**운영 지표를 볼 때 거는 필터:** `environment = production`, 내부 테스터 제외(테스터의 `installation_id` 또는 로그인 계정 `distinct_id`), 비회원 체험을 빼려면 `is_guest = false`.

## 4. 전체 이벤트 목록

### ① SDK 자동

| 이벤트 | 발생 |
| --- | --- |
| `Application Installed` | 설치 후 첫 실행 |
| `Application Updated` | 앱 업데이트 후 첫 실행 |
| `Application Opened` | 앱 실행 |
| `Application Became Active` | 포그라운드로 돌아옴 |
| `Application Backgrounded` | 백그라운드로 감 |

### ② 앱 이벤트

이름은 [`eventNames.ts`](../../src/analytics/eventNames.ts)(기능 이벤트)와 [`uiEvents.ts`](../../src/analytics/uiEvents.ts)(UI 이벤트)에서 관리하고 `__tests__/analyticsEventNames.test.ts`로 고정한다.

| 영역 | 이벤트 | 상세 |
| --- | --- | --- |
| 진입 | `app_opened` | 로그인 상태가 확인된 앱 실행. `is_logged_in` |
| 로그인 | `login_started`, `login_finished` | 소셜 로그인 시도와 결과. 공유에서 왔으면 `entry`, `share_id` → [상세](./SHARE_AND_HISTORY_EVENTS.md#51-진입과-로그인) |
| 히스토리 | `history_viewed`, `history_content_viewed`, `history_content_detail_viewed` | 목록·카드 노출·상세 → [상세](./SHARE_AND_HISTORY_EVENTS.md#52-히스토리) |
| 추출 재시도 | `extraction_request_started`, `extraction_request_finished` (`source=history_retry`) | 히스토리에서 다시 시도한 추출 → [상세](./SHARE_AND_HISTORY_EVENTS.md#52-히스토리) |
| 장소 활용 | `saved_places_viewed`, `saved_places_search_submitted`, `saved_place_selected`, `saved_place_opened`, `place_map_viewed` | 보관함·검색·지도·상세·카카오맵 → [상세](./SHARE_AND_HISTORY_EVENTS.md#53-장소-활용) |
| UI | `screen_viewed`, `button_pressed`, `selection_changed`, `modal_viewed`, `step_viewed`, `list_refreshed`, `map_search_submitted`, `action_finished` | 화면·버튼·기능 결과 → [UI_EVENTS.md](./UI_EVENTS.md) |

### ③ 네이티브 공유 이벤트

공유 확장과 기기 작업이 기록한다. 상세는 [SHARE_AND_HISTORY_EVENTS.md 2~4장](./SHARE_AND_HISTORY_EVENTS.md#2-공유-화면-네이티브).

| 단계 | 이벤트 |
| --- | --- |
| 공유 화면 | `reel_share_received`, `reel_share_feedback_viewed`, `reel_share_outcome_viewed`, `reel_share_action_clicked`, `reel_share_card_dismissed` |
| 기기 보관·전송 | `share_local_save_resolved`, `share_delivery_status_changed` |
| 추출 요청 | `extraction_request_started`, `extraction_request_finished` (`share_id` 있음) |

### 비활성

`pending_places_viewed`, `pending_place_save_finished`, `pending_place_discard_finished`, `pending_resolution_completed`. 대기함 화면이 제거되어 호출되는 곳이 없다. 대기함을 되살릴 때를 위해 이름과 함수만 남겨 두었다.

## 5. 보내지 않는 정보

URL, 공유 텍스트, 토큰, 오류 메시지 원문, 검색어(길이만 보냄), 장소명, 주소, 좌표, 이메일, 자유 입력 텍스트. 비회원 체험용 예시 콘텐츠·장소(`ONBOARDING_SAMPLE_IDS`)에 대한 히스토리·장소 활용 이벤트도 보내지 않는다.

개인정보 처리방침의 국외 이전 항목([terms-and-privacy.md](../terms-and-privacy.md))이 PostHog로 보내는 정보 범위를 설명한다. 보내는 정보의 종류가 바뀌면 그 문서도 확인한다.

## 6. 이벤트를 추가하거나 바꿀 때

| 추가하는 것 | 고칠 곳 |
| --- | --- |
| 화면의 새 버튼·모달·선택 | 컴포넌트에서 `useScreenAnalytics('화면_이름')`의 `button`/`modal`/`selection`을 호출하고 [UI_EVENTS.md](./UI_EVENTS.md)에 이름을 추가한다. 새 이벤트 이름은 만들지 않는다 |
| 새 기능 이벤트 | `eventNames.ts`에 이름을 추가하고 `src/analytics/`에 기록 함수를 만든다. `analyticsEventNames.test.ts` 스냅샷과 [SHARE_AND_HISTORY_EVENTS.md](./SHARE_AND_HISTORY_EVENTS.md)를 갱신한다 |
| 새 네이티브 공유 이벤트·속성 | 허용 목록 세 곳을 모두 고친다: iOS `ShareAnalyticsStore.allowedProperties`, Android `ShareAnalyticsStore.eventProperties`, JS `SHARE_EXTRACTION_EVENTS`/`EVENT_KEYS`. 네이티브 변경이므로 스토어 출시가 필요하다 |

- 이벤트 이름이나 속성 값을 바꾸면 Funnel과 대시보드가 끊긴다. 바꿀 때는 문서와 [DASHBOARDS.md](./DASHBOARDS.md)를 같이 고친다.
- 새 버전부터 생기는 이벤트·속성은 문서에 🆕로 표시하고, 지표를 볼 때 `release`로 나눈다.
