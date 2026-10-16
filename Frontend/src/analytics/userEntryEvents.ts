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
    /** 비회원 체험 데이터를 이어받는 로그인이면 true입니다. 이전 결과는 `guest_transfer_finished`에서 봅니다. */
    hasGuestTransfer?: boolean;
  },
) {
  capture(client, ANALYTICS_EVENTS.loginFinished, {
    provider: params.provider,
    outcome: params.outcome,
    ...(params.hasGuestTransfer === undefined
      ? {}
      : {has_guest_transfer: params.hasGuestTransfer}),
    ...(params.outcome === 'failure' && params.failureType
      ? {failure_type: params.failureType}
      : {}),
  });
}

/**
 * 비회원 체험 데이터를 회원 계정으로 옮기는 작업이 끝났을 때 기록합니다.
 * 로그인 직후가 아니라 추출 완료까지 이어지고 앱을 다시 열어 재시도할 수 있어,
 * `login_finished`와 따로 기록합니다. 옮길 데이터가 없었던 경우는 기록하지 않습니다.
 */
export function trackGuestTransferFinished(
  client: AnalyticsClient | null | undefined,
  outcome: 'success' | 'failure',
) {
  capture(client, ANALYTICS_EVENTS.guestTransferFinished, {outcome});
}
