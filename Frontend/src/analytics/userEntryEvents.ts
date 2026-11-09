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

/**
 * 로그인 화면에 들어온 경로입니다. 공유 화면의 [로그인]으로 넘어온 경우만 구분하고,
 * 그 공유 건의 `share_id`를 함께 남겨 공유 이벤트와 연결합니다.
 */
export type LoginEntry = {entry: 'share_login_handoff'; shareId?: string};

function loginEntryProperties(entry: LoginEntry | null | undefined) {
  if (!entry) return {};
  return {
    entry: entry.entry,
    ...(entry.shareId ? {share_id: entry.shareId} : {}),
  };
}

export function trackLoginStarted(
  client: AnalyticsClient | null | undefined,
  provider: LoginProvider,
  entry?: LoginEntry | null,
) {
  capture(client, ANALYTICS_EVENTS.loginStarted, {
    provider,
    ...loginEntryProperties(entry),
  });
}

export function trackLoginFinished(
  client: AnalyticsClient | null | undefined,
  params: {
    provider: LoginProvider;
    outcome: LoginOutcome;
    failureType?: LoginFailureType;
    entry?: LoginEntry | null;
    /** 성공했을 때 서버가 알려 준 신규 가입 여부입니다. 서버가 내리지 않으면 비웁니다. */
    isNewMember?: boolean;
  },
) {
  capture(client, ANALYTICS_EVENTS.loginFinished, {
    provider: params.provider,
    outcome: params.outcome,
    ...(params.outcome === 'failure' && params.failureType
      ? {failure_type: params.failureType}
      : {}),
    ...(params.outcome === 'success' && typeof params.isNewMember === 'boolean'
      ? {is_new_member: params.isNewMember}
      : {}),
    ...loginEntryProperties(params.entry),
  });
}
