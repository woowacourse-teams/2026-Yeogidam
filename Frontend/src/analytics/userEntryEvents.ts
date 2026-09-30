import {
  capture,
  getCommonAnalyticsProperties,
  type AnalyticsClient,
} from './analytics';

export type LoginProvider = 'apple' | 'kakao' | 'google';
export type LoginOutcome = 'success' | 'failure';
export type LoginFailureType =
  | 'user_cancelled'
  | 'auth_failed'
  | 'network_error'
  | 'app_return_failed'
  | 'unknown';

export function trackAppOpened(
  client: AnalyticsClient | null | undefined,
  isLoggedIn: boolean,
) {
  capture(client, 'app_opened', {
    ...getCommonAnalyticsProperties(),
    is_logged_in: isLoggedIn,
  });
}

export function trackLoginStarted(
  client: AnalyticsClient | null | undefined,
  provider: LoginProvider,
) {
  capture(client, 'login_started', {
    ...getCommonAnalyticsProperties(),
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
  capture(client, 'login_finished', {
    ...getCommonAnalyticsProperties(),
    provider: params.provider,
    outcome: params.outcome,
    ...(params.outcome === 'failure' && params.failureType
      ? {failure_type: params.failureType}
      : {}),
  });
}
