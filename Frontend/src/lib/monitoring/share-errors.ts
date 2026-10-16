import {Platform} from 'react-native';
import * as Sentry from '@sentry/react-native';

import {describeEnvironmentAndDevice} from './environment';

const SHARE_LOGIN_HANDOFF_MESSAGES: Record<string, {title: string; description: string}> = {
  SHARE_LOGIN_STATE_READ_FAILED: {
    title: '장소 공유 오류 · 로그인 상태 확인',
    description: '공유 후 앱으로 돌아온 뒤 로그인 상태를 확인하지 못했습니다.',
  },
};

/** 공유 뒤 로그인 핸드오프 단계에서 생긴 오류를 Sentry에 보냅니다. 모르는 코드는 보내지 않습니다. */
export function captureShareLoginHandoffError(errorCode: string) {
  const event = SHARE_LOGIN_HANDOFF_MESSAGES[errorCode];
  if (!event) return;

  const message = `${event.description}\n` +
    `${describeEnvironmentAndDevice()}\n` +
    `원인: 저장된 로그인 세션 조회 실패 (${errorCode})`;

  const error = new Error(message);
  error.name = event.title;

  Sentry.withScope(scope => {
    scope.setLevel('error');
    scope.setTag('feature', 'instagram_share');
    scope.setTag('share.stage', 'login_handoff');
    scope.setTag('share.source', 'instagram');
    scope.setTag('share.platform', Platform.OS);
    scope.setTag('share.error_code', errorCode);
    scope.setFingerprint(['instagram-share', 'login_handoff', Platform.OS, errorCode]);
    Sentry.captureException(error);
  });
}
