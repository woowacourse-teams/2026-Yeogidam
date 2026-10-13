# 공유부터 히스토리까지의 PostHog 계측 계약

Android와 iOS의 공유 화면, 기기 전송 작업, 앱 히스토리에 적용한다. 기존 앱 진입·로그인 이벤트는 유지한다. 이 문서의 이벤트는 사용자가 실제로 본 경험과 기기에서 진행된 처리 상태를 구분한다.

## ID와 연결

- `share_id`: 공유 화면에 들어온 한 번의 시도. 모든 네이티브 공유 이벤트의 속성에 유지한다.
- `installation_id`: 앱 설치본에 생성하는 UUID. 앱 이벤트와 네이티브 공유 이벤트에 공통으로 넣는다. 앱을 열기 전에 공유 확장이 먼저 실행돼도 그쪽에서 ID를 만들고, 나중에 앱이 같은 ID를 읽는다. 로그인 여부와 무관한 이벤트 필터용 속성이며 PostHog `distinct_id`를 대체하지 않는다.
- 네이티브 공유 이벤트는 첫 이벤트 기록 시점에 저장된 로그인 세션의 `userId`가 있으면 이를 PostHog `distinct_id`로 쓴다. 세션이 없으면 `share_id`를 `distinct_id`로 쓰고 프로필 생성은 끈다. 한 공유 건에서는 처음 정한 ID를 이후 상태 이벤트에도 유지하므로 토큰 갱신이나 전송 지연으로 ID가 바뀌지 않는다.
- `content_id`: 히스토리의 콘텐츠 항목 ID. API 응답의 `reelId`를 계측 시 `content_id`로 변환한다. API 필드명과 저장 모델의 `reelId`는 변경하지 않는다.
- 여러 공유 시도가 같은 `content_id`를 가리킬 수 있다. 2xx 응답에서 `reelId`를 받은 건은 `extraction_request_finished`의 `share_id`와 `content_id`로 연결할 수 있다. 로그인 세션이 있는 공유 이벤트는 앱의 사용자 ID와 같아 사용자 기준으로 분석할 수 있다. 세션이 없는 공유 이벤트는 사용자에게 자동 연결되지 않는다. 응답을 못 받은 공유나 히스토리 목록만 조회한 건은 공유 건과 콘텐츠를 확실히 연결할 수 없다.

URL, 공유 텍스트, 토큰, 오류 메시지 원문은 PostHog에 보내지 않는다. 네이티브 공유 이벤트에는 `share_id`, `platform`, `release`, `environment`, 가능한 경우 `installation_id`와 발생 시각을 포함한다. 앱 SDK의 자동 이벤트에도 `environment`와 가능한 경우 `installation_id`를 포함한다. 로컬 앱은 `.env`의 `APP_ENV`를 사용하고, 값이 없으면 `development`로 기록한다. 내부 스토어 배포와 공개 앱 모두 `APP_ENV=production`을 사용한다. 이 속성은 실행 환경 필터이며 내부 배포 여부를 뜻하지 않는다.

내부 테스터를 운영 지표에서 제외할 때는 `environment=production`으로 조회한 뒤, 테스터의 `installation_id` **또는** 로그인 계정의 `distinct_id`에 해당하는 이벤트를 제외한다. 설치 ID는 비로그인 앱·공유 이벤트를, 사용자 ID는 로그인 이후 다른 설치본까지 구분한다. 한 설치본을 여러 사람이 함께 쓰면 그 설치본의 이벤트가 모두 제외된다. 테스터 설치 ID는 처음 발생한 앱 또는 공유 이벤트에서 확인해 목록에 등록해야 하므로, 등록 전 첫 비로그인 공유는 자동으로 테스터라고 알 수 없다.

## 사용자 경험 이벤트

| 이벤트 | 발생 기준 | 속성 |
| --- | --- | --- |
| `reel_share_received` | 여기담 공유 화면이 열리고 이번 공유 ID가 생성됨 | `share_id` |
| `reel_share_feedback_viewed` | 최종 안내 문구가 공유 화면에 표시됨 | `share_id`, `feedback_type=received/invalid_link/save_failed` |
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
| `extraction_request_finished` | 응답을 확인하거나 재시도 후 최종 실패 | `share_id`, `outcome=response_received/request_failed`, 선택적 `response_status`, `failure_type`, `content_id` |

`deferred.reason`은 `login_required`, `auth_pending`, `network_unavailable`, `queue_registration_failed` 중 하나다. 같은 공유 건이 다른 사유로 다시 대기하거나 `queued`로 바뀌면 상태 변경을 별도 이벤트로 기록한다. 대기는 최종 실패가 아니다. 인증 문제가 해결되면 같은 `share_id`로 다시 전송한다.

`extraction_request_finished.failure_type`은 최종 요청 실패에만 쓰며 `auth_failed`, `timeout`, `network_error`, `server_error`, `invalid_request` 중 하나다. `response_received`는 기기가 2xx 응답을 받았다는 뜻이다. 장소 추출의 최종 성공이나 실패는 히스토리의 `processing_status`가 화면에 표시될 때 사용자 경험 이벤트로 확인한다.

## 해석과 한계

1. 공유 시도 → 기기 보관 → 전송 대기 → 작업 등록 → 실제 요청 → 응답 순서의 건수는 고유 `share_id`로 계산한다. PostHog 도착 순서보다 이벤트 발생 시각을 사용한다.
2. PostHog 설정을 포함해 빌드한 앱에서는 Android WorkManager와 iOS background URLSession이 앱을 한 번도 열지 않았어도 공유 이벤트 업로드를 시도한다. Android는 빌드 설정, iOS 공유 확장은 자체 Info.plist의 PostHog 설정을 읽는다. 베타 iOS 아카이브에는 배포 워크플로가 이 값을 주입하고, 로컬 Xcode 빌드는 공유 확장의 xcconfig가 `.env`를 읽는다. 앱을 열어 동기화한 설정이 있으면 이를 우선한다. 네트워크·OS 실행 정책에 따라 업로드가 지연될 수 있으며, 앱을 열면 남은 네이티브 이벤트를 다시 전송한다. 첫 실행 전에는 로그인 세션과 Supabase 설정이 없을 수 있으므로 API 요청은 대기할 수 있다.
3. `extraction_request_started`는 기기의 전송 시도다. 서버가 요청을 실제 수신한 사실과 앱을 열지 않은 상태의 최종 장소 추출 결과는 백엔드 계측 없이는 알 수 없다.
4. `content_id`가 없는 요청 실패는 히스토리 항목과 연결하지 않는다. `content_id`가 있어도 같은 콘텐츠를 여러 번 공유했다면 히스토리 열람을 특정 `share_id` 하나에 귀속하지 않는다.
5. `installation_id`는 Android의 백업 제외 앱 파일과 iOS 앱 그룹의 백업 제외 파일에 보관한다. 로그아웃해도 유지되고 앱 데이터를 지우거나 삭제 후 다시 설치하면 새 값이 생긴다. 재설치한 테스터는 새 설치 ID를 목록에 등록해야 한다. 저장소에 접근할 수 없는 이벤트에는 이 속성이 빠질 수 있다. 이미 수집된 이벤트에는 소급 적용되지 않는다.
