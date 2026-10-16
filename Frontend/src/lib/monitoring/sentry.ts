import * as Sentry from '@sentry/react-native';
import Config from 'react-native-config';

/** 네이티브 공유 코드(ShareSentryReporter)도 같은 DSN을 각자 들고 있습니다. 바꿀 때 함께 바꿉니다. */
const SENTRY_DSN =
  'https://f6c4700ac928b9ecc34983fb58d0dcda@o4512179066896384.ingest.us.sentry.io/4512179119456256';

/** 앱 모듈이 처음 로드될 때 한 번 부릅니다. */
export function initSentry() {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: Config.APP_ENV?.trim() || 'development',

    // Adds more context data to events (IP address, cookies, user, etc.)
    // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
    sendDefaultPii: false,

    // Enable Logs
    enableLogs: false,

    // uncomment the line below to enable Spotlight (https://spotlightjs.com)
    // spotlight: __DEV__,
  });
}

/** 루트 컴포넌트를 Sentry 오류 경계로 감쌉니다. */
export const withSentry = Sentry.wrap;
