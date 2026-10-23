import {Platform} from 'react-native';
import * as Sentry from '@sentry/react-native';

import type {NormalizedAuthError} from '../auth/errors';
import type {SocialProvider} from '../auth/social-provider';
import {describeEnvironmentAndDevice} from './environment';

const SOCIAL_PROVIDER_LABELS: Record<SocialProvider, string> = {
  apple: '애플',
  kakao: '카카오',
  google: '구글',
};

const LOGIN_STAGE_LABELS: Record<string, string> = {
  login_setup: '로그인 시작 준비',
  authorization_url: '인증 URL 요청',
  provider_authorization: '외부 서비스 인증',
  callback: '로그인 콜백 처리',
  backend_exchange: '백엔드 토큰 교환',
  session_persist: '로그인 세션 저장',
  unknown: '로그인 처리',
};

/** 사용자가 취소했거나 제공자가 인증을 거절한 경우는 앱 오류가 아니므로 보고하지 않습니다. */
const USER_SIDE_CODES = ['AUTH000_001', 'AUTH400_001'];
const USER_SIDE_BACKEND_CODES = ['AUTH401_002'];

/** 네트워크, 시간 초과, 응답 처리, 제공자 연결 오류와 5xx만 앱 오류로 봅니다. */
const REPORTABLE_CODES = ['CLIENT000_001', 'CLIENT000_002', 'CLIENT000_003', 'AUTH502_001'];
const REPORTABLE_BACKEND_CODES = ['AUTH502_001', 'AUTH502_002', 'AUTH503_001', 'AUTH503_002'];

export function isReportableSocialLoginError(error: NormalizedAuthError): boolean {
  const backendErrorCode = error.backendErrorCode;
  if (
    USER_SIDE_CODES.includes(error.errorCode) ||
    (backendErrorCode != null && USER_SIDE_BACKEND_CODES.includes(backendErrorCode))
  ) {
    return false;
  }

  return (
    (error.status != null && error.status >= 500) ||
    REPORTABLE_CODES.includes(error.errorCode) ||
    REPORTABLE_BACKEND_CODES.includes(backendErrorCode ?? '')
  );
}

export function describeSocialLoginError(
  provider: SocialProvider,
  error: NormalizedAuthError,
): string {
  const providerLabel = SOCIAL_PROVIDER_LABELS[provider];
  const reason =
    error.errorCode === 'CLIENT000_001'
      ? '네트워크 연결 오류'
      : error.errorCode === 'CLIENT000_002'
        ? '요청 시간 초과'
        : error.errorCode === 'CLIENT000_003'
          ? '응답 처리 오류'
          : error.status != null && error.status >= 500
            ? '서버 오류'
            : error.errorCode === 'AUTH502_001'
              ? '로그인 제공자 연결 오류'
              : '로그인 처리 오류';
  const codes = [
    error.errorCode,
    error.backendErrorCode && error.backendErrorCode !== error.errorCode
      ? error.backendErrorCode
      : null,
    error.status == null ? null : `HTTP ${error.status}`,
  ].filter(Boolean).join(', ');

  return `${providerLabel} 로그인 중 오류가 발생했습니다.\n` +
    `${describeEnvironmentAndDevice()}\n` +
    `원인: ${reason} (${codes})`;
}

export function getSocialLoginErrorTitle(error: NormalizedAuthError): string {
  const stageLabel = LOGIN_STAGE_LABELS[error.stage ?? 'unknown'] ?? '로그인 처리';
  return `소셜 로그인 오류 · ${stageLabel}`;
}

/** Android에서 브라우저가 인증 콜백 없이 닫혀 취소로 처리된 경우를 진단용 경고로 보냅니다. 실제 사용자 취소도 섞여 있습니다. */
function captureBrowserClosedWithoutCallback(
  provider: SocialProvider,
  error: NormalizedAuthError,
) {
  const cancelOrigin = error.cancelOrigin;
  if (
    Platform.OS !== 'android' ||
    (cancelOrigin !== 'browser_cancel' && cancelOrigin !== 'browser_dismiss')
  ) {
    return;
  }

  Sentry.withScope(scope => {
    scope.setTag('feature', 'social_login');
    scope.setTag('login.provider', provider);
    scope.setTag('login.stage', error.stage ?? 'unknown');
    scope.setTag('login.error_code', error.errorCode);
    scope.setTag('login.cancel_origin', cancelOrigin);
    scope.setFingerprint(['social-login-browser-without-callback', provider, cancelOrigin]);
    Sentry.captureMessage('소셜 로그인 브라우저가 콜백 없이 종료됨', 'warning');
  });
}

/** 소셜 로그인 실패를 Sentry에 보냅니다. 메시지에는 토큰이나 개인 정보 없이 환경, 기기, 오류 코드만 적습니다. */
export function captureSocialLoginError(
  provider: SocialProvider,
  error: NormalizedAuthError,
) {
  if (error.errorCode === 'AUTH000_001') {
    // 브라우저 종료에는 실제 사용자 취소도 포함될 수 있어 진단용 경고로 기록합니다.
    captureBrowserClosedWithoutCallback(provider, error);
    return;
  }
  if (!isReportableSocialLoginError(error)) return;
  const backendErrorCode = error.backendErrorCode;

  Sentry.withScope(scope => {
    scope.setTag('feature', 'social_login');
    scope.setTag('login.provider', provider);
    scope.setTag('login.stage', error.stage ?? 'unknown');
    scope.setTag('login.error_code', error.errorCode);
    if (backendErrorCode) {
      scope.setTag('login.backend_error_code', backendErrorCode);
    }
    if (error.status != null) {
      scope.setTag('http.status_code', String(error.status));
    }
    scope.setExtra('request_id', error.requestId);
    scope.setExtra('retryable', error.retryable);
    scope.setFingerprint([
      'social-login',
      provider,
      backendErrorCode ?? error.errorCode,
      String(error.status ?? 'no-status'),
    ]);

    const safeError = new Error(describeSocialLoginError(provider, error));
    safeError.name = getSocialLoginErrorTitle(error);
    Sentry.captureException(safeError);
  });
}
