import {ANALYTICS_EVENTS} from './eventNames';
import {capture, type AnalyticsClient} from './analytics';

export type LoginProvider = 'apple' | 'kakao' | 'google';
export type LoginOutcome = 'success' | 'failure';
export type LoginFailureType =
  | 'user_cancelled'
  | 'auth_failed'
  | 'network_error'
  | 'app_return_failed'
  | 'unknown';

/** 로그인 오류 코드를 `failure_type`으로 분류합니다. 알 수 없는 오류는 `unknown`입니다. */
export function toLoginFailureType(
  error: {errorCode?: string | null} | null | undefined,
): LoginFailureType {
  switch (error?.errorCode) {
    case 'AUTH000_001':
      return 'user_cancelled';
    case 'CLIENT000_001':
    case 'CLIENT000_002':
      return 'network_error';
    case 'AUTH400_001':
    case 'AUTH502_001':
      return 'auth_failed';
    // 인증 후 앱으로 돌아온 응답을 처리하지 못한 경우입니다.
    case 'CLIENT000_003':
      return 'app_return_failed';
    default:
      return 'unknown';
  }
}

export function trackAppOpened(
  client: AnalyticsClient | null | undefined,
  isLoggedIn: boolean,
) {
  capture(client, ANALYTICS_EVENTS.appOpened, {
    is_logged_in: isLoggedIn,
  });
}

export function trackLoginStarted(
  client: AnalyticsClient | null | undefined,
  provider: LoginProvider,
) {
  capture(client, ANALYTICS_EVENTS.loginStarted, {
    provider,
  });
}

export function trackLoginFinished(
  client: AnalyticsClient | null | undefined,
  params: {
    provider: LoginProvider;
    outcome: LoginOutcome;
    failureType?: LoginFailureType;
  },
) {
  capture(client, ANALYTICS_EVENTS.loginFinished, {
    provider: params.provider,
    outcome: params.outcome,
    ...(params.outcome === 'failure' && params.failureType
      ? {failure_type: params.failureType}
      : {}),
  });
}
