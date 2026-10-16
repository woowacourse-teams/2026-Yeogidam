# EAS Update로 JS 번들 OTA 배포하기 (fe-test 실험용)

fe-test 워크트리는 bare React Native 0.86에 Expo 모듈과 `expo-updates` 57을 설치한 상태입니다. 네이티브 코드(공유 익스텐션, 카카오 지도, 권한)는 여전히 스토어 빌드가 필요하고, JS와 에셋만 `eas update`로 바로 내보냅니다.

## 1. 한 번만 하는 준비

이 환경에는 Xcode와 CocoaPods가 없어서 아래는 사용자 로컬 터미널에서 직접 실행합니다. Claude Code 세션 안에서는 `! <명령>`으로 실행하면 결과가 대화에 남습니다.

```bash
cd Frontend
npx eas-cli login                       # 개인 Expo 계정
npx eas-cli init                        # app.json의 expo.extra.eas.projectId를 채운다
npx eas-cli update:configure --platform all
```

`eas update:configure`가 하는 일은 셋입니다.

- `app.json`의 `expo.updates.url`을 `https://u.expo.dev/<projectId>`로 채웁니다.
- iOS `ios/Frontend/Supporting/Expo.plist`를 만들어 Xcode 프로젝트에 넣습니다. 키는 `EXUpdatesEnabled`, `EXUpdatesURL`, `EXUpdatesRuntimeVersion`, `EXUpdatesCheckOnLaunch`, `EXUpdatesLaunchWaitMs`이고 채널은 `EXUpdatesRequestHeaders` 안의 `expo-channel-name`입니다.
- Android `AndroidManifest.xml`에 `expo.modules.updates.ENABLED`, `EXPO_UPDATE_URL`, `EXPO_RUNTIME_VERSION`, `EXPO_UPDATES_CHECK_ON_LAUNCH`, `EXPO_UPDATES_LAUNCH_WAIT_MS`, `UPDATES_CONFIGURATION_REQUEST_HEADERS_KEY` meta-data를 넣고, `res/values/strings.xml`에 런타임 버전 문자열을 둡니다.

빌드 스크립트는 따로 손대지 않아도 됩니다. iOS는 `EXUpdates.podspec`의 script_phase가 `create-updates-resources-ios.sh`를 붙이고, Android는 `expo-updates`가 `gradlePlugins`를 선언해 autolinking이 플러그인을 적용합니다.

그다음 네이티브를 한 번 다시 빌드해야 OTA를 받는 바이너리가 됩니다.

```bash
cd ios && pod install && cd ..
npm run ios      # 또는 Xcode에서 Release 스킴으로 기기 빌드
npm run android
```

Debug 빌드는 Metro에서 번들을 받으므로 OTA 적용을 보려면 Release 빌드를 씁니다.

## 2. 런타임 버전 규칙

`app.json`의 `expo.runtimeVersion`은 명시적 문자열(`"2.0.1"`)입니다. 네이티브 코드나 네이티브 의존성을 바꾸면 이 값을 올리고 새 바이너리를 만듭니다. 같은 런타임 버전의 바이너리만 그 번들을 받으므로, 올리지 않으면 옛 바이너리가 맞지 않는 JS를 받아 깨질 수 있습니다. 지금 fe-test에서 바꾼 Swift와 Kotlin(공유 401 재시도, 세션 식별자 분리, Expo 모듈)은 모두 2.0.1 바이너리에 포함됩니다.

## 3. 배포, 확인, 되돌리기

```bash
# fe-test 채널(=브랜치)로 지금 JS를 내보낸다
npx eas-cli update --branch fe-test --message "실험: 보관함 빈 상태 문구"

# 일부에게만 먼저 보낸다
npx eas-cli update --branch fe-test --message "..." --rollout-percentage 20

# 배포 목록과 되돌리기
npx eas-cli update:list --branch fe-test
npx eas-cli update:republish --branch fe-test        # 이전 업데이트를 다시 올린다
npx eas-cli update:rollback --branch fe-test          # 내장 번들로 돌린다
```

앱은 콜드 스타트 때 업데이트를 확인하고(`checkAutomatically: ON_LOAD`) 다음 실행에 적용합니다. 더 빨리 적용하려면 포그라운드 복귀 때 `Updates.checkForUpdateAsync()` → `fetchUpdateAsync()` → `reloadAsync()`를 부르는 코드를 넣습니다(아직 넣지 않음).

## 4. PostHog를 개인 계정으로 바꾸기

앱과 공유 익스텐션은 모두 `.env`의 두 값을 씁니다. 앱은 `src/app/PostHogRoot.tsx`가 `Config.POSTHOG_PROJECT_TOKEN`과 `Config.POSTHOG_HOST`를 읽고, 익스텐션은 앱이 시작할 때 `syncShareAnalyticsConfiguration`으로 같은 값을 네이티브 저장소에 넣습니다.

1. 개인 PostHog 계정에서 프로젝트를 하나 만들고 Settings → Project → Project API key(`phc_...`)를 복사합니다. 호스트는 US 클라우드면 `https://us.i.posthog.com`, EU면 `https://eu.i.posthog.com`입니다.
2. `Frontend/.env`의 두 줄을 바꿉니다(.env는 gitignore 대상이라 커밋되지 않습니다).
   ```
   POSTHOG_PROJECT_TOKEN=phc_개인_프로젝트_키
   POSTHOG_HOST=https://us.i.posthog.com
   ```
3. react-native-config는 빌드 때 값을 굽기 때문에 `.env`를 바꾼 뒤에는 앱을 다시 빌드합니다(Metro 재시작만으로는 반영되지 않습니다).
4. 팀 PostHog에 섞이지 않게 `APP_ENV=development`를 유지하면 이벤트의 `environment` 속성으로 구분됩니다.

## 5. 실험 플래그 쓰는 법

`src/lib/experiments.ts`의 훅 둘을 씁니다. 변형 코드는 한 번들에 같이 넣고 노출만 플래그로 가릅니다. 그래야 플래그를 끄는 것만으로 실험을 거둘 수 있고, OTA는 새 변형 코드를 싣는 데만 씁니다.

```tsx
const variant = useExperimentVariant('saved-places-empty-copy', ['warm', 'direct'] as const);
// 'control' | 'warm' | 'direct'

const showNewSheet = useFeatureEnabled('map-sheet-v2', false);
```

PostHog에서는 Feature flags → New feature flag에서 다변량 플래그를 만들고 변형 키를 코드와 같게 둡니다. Experiments에서 그 플래그로 실험을 만들면 노출과 목표 이벤트를 PostHog가 집계합니다. 플래그는 앱을 열 때와 포그라운드로 돌아올 때 다시 받습니다(`PostHogRoot.tsx`).

사용자 수가 적을 때는 통계 유의성이 나오기까지 오래 걸리므로, PostHog의 표본 수 계산기로 먼저 확인하고 리플레이와 퍼널로 반응을 보는 쪽이 현실적입니다.

## 6. 스토어 정책 선

Apple DPLA 3.3.1(B)는 앱의 주된 목적을 바꾸지 않는 해석 코드 다운로드를 허용합니다. 문구, 배치, 기존 기능 안의 순서처럼 UI를 바꾸는 실험은 OTA로 보내고, 새 주요 기능이나 앱 성격을 바꾸는 화면은 바이너리로 심사받습니다. 심사 때 숨겨 둔 기능을 출시 뒤 플래그로 켜는 방식은 지침 2.3.1(a)와 부딪힐 수 있습니다.
