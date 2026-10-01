# Frontend beta 배포

## 실행 흐름

1. `fe-dev`에서 구현과 QA를 마치면 `fe-release` 브랜치로 PR을 보내 병합한다. QA 수정 PR도 같은 브랜치로 보낸다.
2. GitHub의 **Actions → Frontend Beta → Run workflow**에서 브랜치로 정확히 `fe-release`, 플랫폼으로 `android` 또는 `ios`를 선택하고 앱 버전(예: `1.1.0`)을 직접 입력한다.
3. 워크플로가 `fe-release`의 HEAD를 검증하고 Frontend CI를 실행한다. CI가 성공하면 앱 버전과 빌드 번호를 네이티브 빌드에 전달한다. Android는 Play `internal`, iOS는 TestFlight에 업로드한다.
4. beta 배포 과정에서는 Git 태그를 만들거나 요구하지 않는다. QA가 끝나면 `fe-release`에서 `fe-main`으로 PR을 보낸다. QA 수정사항은 `fe-dev`에도 반영한다.

태그 없이 배포 이력을 찾을 때에는 Actions 실행 번호, 실행 커밋, 플랫폼, 업로드된 AAB 또는 TestFlight 빌드 번호를 확인한다. 빌드 번호 배정 전에 브랜치가 전진하면 검증이 실패한다. 두 플랫폼의 beta 실행이 끝날 때까지 `fe-release`에 새 커밋을 넣지 않는다.

## 버전과 빌드 번호

앱 버전은 수동 실행 화면의 필수 입력값이다. `1.1.0`처럼 숫자 세 부분으로 입력하며 `v` 접두사나 사전 출시 접미사는 허용하지 않는다. 이 입력값이 Android와 iOS 앱 버전에 사용되며 `Frontend/package.json`의 `version`은 읽지 않는다. 두 플랫폼을 같은 앱 버전으로 배포하려면 각각 실행할 때 같은 버전을 입력한다. 빌드 번호는 직접 입력하지 않는다.

빌드 번호는 `플랫폼별 고정 오프셋 + GITHUB_RUN_NUMBER`로 계산한다. `GITHUB_RUN_NUMBER`는 이 워크플로의 새 실행마다 증가하며, 같은 실행을 재시도할 때는 유지된다. Android와 iOS가 서로 다른 실행 번호를 사용해도 된다. 예를 들어 Android 오프셋이 `42`이고 Actions 실행 번호가 `7`이면 Android 빌드 번호는 `49`다.

처음 사용하기 전에 Play Console과 App Store Connect에서 각 플랫폼의 가장 큰 기존 빌드 번호를 확인하고 `fe-beta` Environment 변수 `ANDROID_BETA_BUILD_NUMBER_OFFSET`와 `IOS_BETA_BUILD_NUMBER_OFFSET`에 설정한다. 기존 빌드가 없다면 `0`으로 설정한다. 오프셋은 설정 후 고정하고, 이후 업로드를 이 워크플로로만 진행한다. 스토어에 더 높은 번호를 수동 업로드하거나 워크플로의 실행 번호가 초기화될 수 있는 변경을 한다면, 번호 정책을 다시 검토해야 한다. 변수가 비어 있으면 업로드 전에 실패한다.

같은 Actions 실행을 다시 돌리면 같은 빌드 번호가 나온다. 스토어 업로드까지 성공한 실행을 다시 업로드하면 중복 번호로 거절될 수 있으므로 새 수동 실행을 시작한다. CI 단계에서 실패한 실행 번호는 건너뛰어도 된다. Android 빌드 번호는 Google Play의 최대 `2100000000`을 넘지 않게 검사한다.

앱 버전은 Android `versionName`, iOS 앱·Share Extension의 `MARKETING_VERSION`, 앱 내부 업데이트 정책의 `APP_VERSION`에 전달된다. 빌드 번호는 Android `versionCode`, iOS 앱·Share Extension의 `CURRENT_PROJECT_VERSION`에 전달된다. 로컬 빌드는 프로젝트 파일의 기본 버전과 빌드 번호를 사용한다.

## GitHub 설정

- 단일 `fe-release` 브랜치에 PR 검토 및 필수 CI 규칙을 적용한다.
- `workflow_dispatch`가 선언된 `frontend-beta.yml`을 저장소의 기본 브랜치에도 반영해야 **Run workflow** 버튼이 표시된다. 실행할 때 브랜치 선택 메뉴에서 `fe-release`를 고른다. 다른 브랜치를 선택하면 워크플로가 실패한다.
- `fe-beta` Environment의 배포 브랜치 패턴에 `fe-release`를 허용한다.
- `fe-beta` Environment 변수 `ANDROID_BETA_BUILD_NUMBER_OFFSET`와 `IOS_BETA_BUILD_NUMBER_OFFSET`를 등록한다. 번호 계산 job도 이 Environment를 지정해 두 값을 읽는다. 빌드 번호 계산에 사용하는 값이므로 변경 이력을 관리한다.

`fe-beta` Environment Secrets:

| Secret | 내용 |
| --- | --- |
| `KAKAO_NATIVE_APP_KEY` | Kakao 네이티브 앱 키 |
| `SUPABASE_URL` | beta 앱의 Supabase URL |
| `SUPABASE_PUBLISHABLE_KEY` | beta 앱의 Supabase publishable key |
| `POSTHOG_PROJECT_TOKEN` | beta 앱의 PostHog 프로젝트 토큰 |
| `POSTHOG_HOST` | beta 앱의 PostHog 이벤트 수집 호스트 |
| `ANDROID_UPLOAD_KEYSTORE_BASE64` | Play App Signing 업로드 keystore 파일의 Base64 |
| `ANDROID_UPLOAD_STORE_PASSWORD` | keystore 비밀번호 |
| `ANDROID_UPLOAD_KEY_ALIAS` | 업로드 키 alias |
| `ANDROID_UPLOAD_KEY_PASSWORD` | 업로드 키 비밀번호 |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | Play Console 배포 권한이 있는 서비스 계정 JSON 전체 |
| `APP_STORE_CONNECT_API_KEY_BASE64` | App Store Connect API 키 `.p8` 파일의 Base64 |
| `APP_STORE_CONNECT_KEY_ID` | API 키 ID |
| `APP_STORE_CONNECT_ISSUER_ID` | API issuer ID |

beta 빌드는 위 Environment Secrets로 runner 임시 설정 파일을 만들고 `ENVFILE`로 Android와 iOS 빌드에 전달한다. 저장소의 `Frontend/.env`는 beta 빌드에 사용하지 않는다.

파일을 Base64로 만들 때 macOS에서 `base64 -i <파일> | tr -d '\n'`을 사용할 수 있다. 로컬 개발용 `Frontend/.env`는 저장소에 커밋하지 않는다.

## 스토어 선행 설정

1. Play Console에 `com.yeogidamm.app`을 등록하고 최초 빌드를 콘솔에서 올린다. Android Publisher API를 활성화하고 서비스 계정에 내부 테스트 배포 권한을 부여한다.
2. App Store Connect에 `com.yeogidamm.app`을 등록한다. Share Extension의 `com.yeogidamm.app.Share`도 Apple Developer 계정에 등록하고, 앱과 확장의 App Groups 및 Sign in with Apple 권한을 맞춘다. 현재 Xcode 프로젝트의 Team ID는 `8QNP67WLL6`이다.
3. TestFlight 내부 테스터 그룹에서 자동 배포를 켠다. Apple의 빌드 처리가 끝나야 테스터에게 제공된다.
