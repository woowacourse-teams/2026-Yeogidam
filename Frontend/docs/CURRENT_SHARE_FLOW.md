# 변경 전 Instagram 공유 플로우

이 문서는 공유 로그인 연결 및 단발 추출 흐름을 적용하기 **전** 코드의 동작을 기록한다. 현재 구현의 기준은 [SHARE_FLOW_CHANGE_PLAN.md](./SHARE_FLOW_CHANGE_PLAN.md)를 참고한다. 대상은 Instagram 릴스와 게시물 URL을 운영체제의 공유 기능으로 여기담에 전달하는 경로다. 앱 안에서 URL을 직접 입력하는 경로는 별도로 동작한다.

## 전체 흐름

```text
Instagram 공유
  → Android ShareActivity / iOS Share Extension
  → URL 검증·정규화, requestId 발급
  → URL과 처리 상태를 기기에 저장
  → 공유용 인증 세션 확인·필요시 갱신
      ├─ 로그인 필요: LOGIN_REQUIRED로 보관
      ├─ 인증·네트워크 대기: 대기 상태로 보관
      └─ 사용 가능한 토큰: save-instagram-reel-v2 요청
  → API 전송 결과를 기기에 저장
  → 본 앱 진입·활성화 시 결과 확인
  → reelId가 있으면 서버 처리 상태 조회
  → 완료 시 저장 장소 새로 조회
```

공유 화면의 **“링크를 받았어요. 여기담 앱에서 확인해 주세요.”**는 URL이 기기에 저장됐다는 안내다. API 전송이나 장소 추출 완료를 뜻하지 않는다.

## 1. 공유 화면에서 URL 접수

| 플랫폼 | 진입점 | 변경 전 처리 |
| --- | --- | --- |
| Android | `android/app/src/main/java/com/yeogidamm/app/share/ShareActivity.kt` | `ACTION_SEND`의 `text/plain`에서 Instagram `/reel/{id}/` 또는 `/p/{id}/` URL을 찾고 정규화한다. `requestId`를 발급해 `ShareResultStore`에 `PENDING` 결과를 먼저 저장한다. |
| iOS | `ios/ShareExtension/ShareViewController.swift` | 공유된 URL 또는 텍스트에서 지원 URL을 추출한다. `requestId`별 `PENDING` 결과를 App Group 저장소에 먼저 저장한다. |

URL을 식별하지 못하면 다시 공유하라는 안내를 보여준다. 로컬 저장에 실패해도 실패 안내를 보여준다. 정상 접수 시에는 두 플랫폼 모두 안내 문구를 잠시 보여준 뒤 공유 화면을 닫는다. 변경 전 공유 화면에는 로그인 버튼이 없다.

저장 결과에는 `requestId`, 정규화한 URL, 원래 공유 텍스트, 처리 상태와 갱신 시각 등이 포함된다. Android는 앱의 SharedPreferences에, iOS는 App Group의 UserDefaults에 요청별 결과를 저장한다. 인증 세션은 결과와 별도의 보호 저장소를 사용한다. 구현 위치는 `android/app/src/main/java/com/yeogidamm/app/share/ShareResultStore.kt`, `ios/Shared/ShareIntentStorage.swift`다.

## 2. 인증 확인과 API 전송

본 앱은 Supabase 세션이 바뀔 때 공유 기능용 세션을 동기화한다(`src/lib/share-intent/index.ts`, `App.tsx`). 공유 화면은 해당 세션의 액세스 토큰을 확인하고, 만료가 가까우면 리프레시 토큰으로 갱신한다.

| 인증 결과 | 로컬 전송 상태 | 변경 전 동작 |
| --- | --- | --- |
| 사용 가능한 토큰 | `QUEUED` → `REQUESTING` | `save-instagram-reel-v2` 호출을 등록한다. |
| 세션 없음 또는 무효한 리프레시 토큰 | `LOGIN_REQUIRED` | URL은 남기고 API 요청은 시작하지 않는다. |
| 일시적인 인증 문제 | `WAITING_FOR_AUTH` | URL을 보관하고 나중에 다시 확인한다. |
| 토큰 갱신 중 네트워크 문제 | `WAITING_FOR_NETWORK` | URL을 보관하고 나중에 다시 확인한다. |

Android는 네트워크 연결 조건을 둔 WorkManager 작업으로 요청한다(`ShareSaveWorker.kt`). iOS는 App Group에 업로드 본문 파일을 만든 후 백그라운드 URLSession으로 요청한다(`ShareIntentStorage.swift`의 `ShareBackgroundTransfer`). 두 플랫폼 모두 `instagramUrl`, `source: instagram_share`, `clientRequestId: requestId`를 전송한다.

HTTP 2xx 응답을 받으면 전송 상태를 `API_SUCCEEDED`로 기록하고, 응답의 `status`, `reelId`, `failureReason`, `retryable`, `saveMode` 등을 저장한다. `API_SUCCEEDED`는 API 응답 단계의 성공이며, 릴스 장소 추출 완료와는 별개다. API 전송이 최종 실패하면 `API_FAILED`와 실패 사유를 저장한다. Android는 일부 재시도 가능한 HTTP 오류 및 네트워크 예외에 제한된 자동 재시도를 적용한다. iOS에는 같은 명시적 재시도 횟수 정책이 없다.

서버 함수 `save-instagram-reel-v2`의 구현은 이 저장소에서 확인되지 않는다. 따라서 서버 내부의 인증 검사와 장소 추출 단계는 이 문서의 확인 범위 밖이다.

## 3. 앱 진입 후 결과 처리

`App.tsx`는 앱 시작 시 세션을 복원하고, 로그인된 경우 `resumeWaitingShares()`를 호출한다. 앱이 다시 활성화될 때도 세션을 조정한 후 대기 중 공유를 재개한다. 네이티브 결과는 앱이 활성 상태인 동안 1초 간격으로 읽는다.

재개 대상은 플랫폼별로 다음과 같다.

| 플랫폼 | `resumeWaitingShares()`가 다루는 상태 |
| --- | --- |
| Android | `SAVED`, `LOGIN_REQUIRED`, `WAITING_FOR_AUTH`, `WAITING_FOR_NETWORK` |
| iOS | `SAVED`, `LOGIN_REQUIRED`, `WAITING_FOR_AUTH`, `WAITING_FOR_NETWORK` |

Android는 기존 공유 세션이 있으면 이 상태들을 WorkManager에 다시 등록한다. iOS는 각 결과에 대해 토큰을 다시 확인하고 사용할 수 있을 때 업로드를 등록한다. **두 플랫폼 모두 최종 `API_FAILED`는 앱 진입 시 재개 대상이 아니다.** URL 자체는 기기에 남아 있어도 해당 요청의 자동 재추출은 진행되지 않는다.

앱은 여러 로컬 결과 중 현재 표시 중인 요청이 있으면 그 결과를, 없으면 정렬된 결과의 마지막 항목을 선택한다. `LOGIN_REQUIRED`이고 앱 세션도 없으면 로그인 화면으로 전환한다. `SAVED`·`WAITING_FOR_NETWORK`·`WAITING_FOR_AUTH`는 화면용 릴스 상태로 넘기지 않고 대기한다. 나머지 전송 상태는 `SharedSaveState`로 전달하고 저장 장소 또는 받은 장소 화면을 연다(`App.tsx`, `src/lib/reel-save-state.ts`). `SharedSaveState`는 메모리 상태이며, 앱 재시작 후 원본은 네이티브 결과 저장소에서 다시 읽는다.

저장 장소 화면(`src/pages/saved-places/SavedPlacesScreen.tsx`)은 `reelId`가 없는 요청에 API 응답 대기 상태를 표시한다. 실제 `reelId`가 있는 처리 중 릴스는 서버의 `processing_status`를 확인하고 3초 간격으로 조회한다. 완료되면 저장 장소를 다시 조회한 뒤 해당 로컬 공유 결과를 소비한다. 처리 상태 조회와 실제 API 전송은 서로 다른 단계다.

## 변경 요구사항과 맞닿는 지점

- **공유 화면 로그인:** 미로그인 또는 재로그인 필요 상태를 구분하고 URL을 보관하지만, 공유 화면에서 로그인을 시작하는 버튼은 없다. 본 앱이 결과를 읽으면 로그인 화면으로 전환한다.
- **로그인 후 추출:** 공유 클라이언트는 요청 전에 인증 토큰을 확인한다. 서버 함수의 인증 강제 여부는 이 저장소만으로 확인할 수 없다.
- **오류 후 앱 진입 시 추출:** URL의 기기 저장과 일부 인증·네트워크 대기 재개는 구현돼 있다. 최종 `API_FAILED`는 재개하지 않는다.
- **여러 건의 공유:** 결과는 `requestId`별로 저장되지만 앱 화면은 한 번에 하나의 결과를 선택한다.

## 주요 코드 위치

| 역할 | 파일 |
| --- | --- |
| Android 공유 화면과 URL 정규화 | `android/app/src/main/java/com/yeogidamm/app/share/ShareActivity.kt` |
| Android 인증·로컬 결과·전송·재개 | `android/app/src/main/java/com/yeogidamm/app/share/ShareAuth.kt`, `ShareAuthStore.kt`, `ShareResultStore.kt`, `ShareSaveWorker.kt`, `ShareIntentModule.kt` |
| iOS 공유 화면 | `ios/ShareExtension/ShareViewController.swift` |
| iOS 인증·로컬 결과·백그라운드 전송 | `ios/Shared/ShareIntentStorage.swift` |
| 네이티브와 React Native 연결 | `ios/Frontend/ShareIntentModule.swift`, `src/lib/share-intent/index.ts` |
| 앱의 인증·결과 선택·재개 | `App.tsx` |
| 추출 결과 표시·상태 조회 | `src/pages/saved-places/SavedPlacesScreen.tsx`, `src/entities/content/api.ts` |
