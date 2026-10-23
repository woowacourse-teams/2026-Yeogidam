import {Platform} from 'react-native';
import * as Sentry from '@sentry/react-native';

import type {NormalizedAuthError} from '../src/lib/auth/errors';
import {
  captureSocialLoginError,
  describeSocialLoginError,
  getSocialLoginErrorTitle,
  isReportableSocialLoginError,
} from '../src/lib/monitoring/login-errors';
import {captureShareLoginHandoffError} from '../src/lib/monitoring/share-errors';

const mockScope = {
  setLevel: jest.fn(),
  setTag: jest.fn(),
  setExtra: jest.fn(),
  setFingerprint: jest.fn(),
};

jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  wrap: (component: unknown) => component,
  withScope: jest.fn((callback: (scope: typeof mockScope) => void) => callback(mockScope)),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
}));

const networkError: NormalizedAuthError = {
  status: null,
  errorCode: 'CLIENT000_001',
  message: '인터넷 연결을 확인해주세요.',
  retryable: true,
  stage: 'authorization_url',
};

const cancelledError: NormalizedAuthError = {
  status: null,
  errorCode: 'AUTH000_001',
  message: '취소',
  retryable: false,
  stage: 'provider_authorization',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('isReportableSocialLoginError', () => {
  test('사용자 취소와 제공자 거절은 보고하지 않는다', () => {
    expect(isReportableSocialLoginError(cancelledError)).toBe(false);
    expect(
      isReportableSocialLoginError({
        ...networkError,
        errorCode: 'AUTH400_001',
        backendErrorCode: 'AUTH401_002',
        status: 401,
      }),
    ).toBe(false);
  });

  test('네트워크 오류, 5xx 제공자 연결 오류, 서버가 알린 제공자 장애는 보고한다', () => {
    expect(isReportableSocialLoginError(networkError)).toBe(true);
    expect(
      isReportableSocialLoginError({...networkError, errorCode: 'AUTH502_001', status: 502}),
    ).toBe(true);
    expect(
      isReportableSocialLoginError({
        ...networkError,
        errorCode: 'CLIENT000_003',
        backendErrorCode: 'AUTH503_001',
        status: 503,
      }),
    ).toBe(true);
  });
});

describe('describeSocialLoginError', () => {
  test('제공자, 환경과 기기, 원인과 코드를 세 줄로 적는다', () => {
    const message = describeSocialLoginError('kakao', networkError);

    expect(message.split('\n')).toEqual([
      '카카오 로그인 중 오류가 발생했습니다.',
      '환경·기기: 개발 · iOS',
      '원인: 네트워크 연결 오류 (CLIENT000_001)',
    ]);
  });

  test('백엔드 코드와 HTTP 상태가 있으면 코드 목록에 함께 적는다', () => {
    const message = describeSocialLoginError('google', {
      ...networkError,
      errorCode: 'AUTH502_001',
      backendErrorCode: 'AUTH502_002',
      status: 502,
    });

    expect(message).toContain('원인: 서버 오류 (AUTH502_001, AUTH502_002, HTTP 502)');
  });

  test('제목은 실패한 단계 이름을 담는다', () => {
    expect(getSocialLoginErrorTitle(networkError)).toBe('소셜 로그인 오류 · 인증 URL 요청');
    expect(getSocialLoginErrorTitle({...networkError, stage: undefined})).toBe(
      '소셜 로그인 오류 · 로그인 처리',
    );
  });
});

describe('captureSocialLoginError', () => {
  test('보고 대상이면 태그와 지문을 달아 Sentry에 보낸다', () => {
    captureSocialLoginError('google', networkError);

    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    const [captured] = (Sentry.captureException as jest.Mock).mock.calls[0] as [Error];
    expect(captured.name).toBe('소셜 로그인 오류 · 인증 URL 요청');
    expect(mockScope.setTag).toHaveBeenCalledWith('login.provider', 'google');
    expect(mockScope.setTag).toHaveBeenCalledWith('login.error_code', 'CLIENT000_001');
    expect(mockScope.setFingerprint).toHaveBeenCalledWith([
      'social-login',
      'google',
      'CLIENT000_001',
      'no-status',
    ]);
  });

  test('사용자 취소는 Sentry에 보내지 않는다', () => {
    captureSocialLoginError('apple', cancelledError);

    expect(Sentry.withScope).not.toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  test.each(['browser_cancel', 'browser_dismiss'] as const)(
    'Android에서 브라우저가 콜백 없이 %s로 닫힌 취소는 진단용 경고로 보낸다',
    cancelOrigin => {
      const platform = jest.replaceProperty(Platform, 'OS', 'android');
      try {
        captureSocialLoginError('kakao', {...cancelledError, cancelOrigin});
      } finally {
        platform.restore();
      }

      expect(Sentry.captureException).not.toHaveBeenCalled();
      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        '소셜 로그인 브라우저가 콜백 없이 종료됨',
        'warning',
      );
      expect(mockScope.setTag).toHaveBeenCalledWith('login.provider', 'kakao');
      expect(mockScope.setTag).toHaveBeenCalledWith('login.stage', 'provider_authorization');
      expect(mockScope.setTag).toHaveBeenCalledWith('login.cancel_origin', cancelOrigin);
      expect(mockScope.setFingerprint).toHaveBeenCalledWith([
        'social-login-browser-without-callback',
        'kakao',
        cancelOrigin,
      ]);
    },
  );

  test('Android에서도 제공자가 거절한 취소는 보내지 않고, iOS에서는 브라우저 취소도 보내지 않는다', () => {
    const platform = jest.replaceProperty(Platform, 'OS', 'android');
    try {
      captureSocialLoginError('google', {...cancelledError, cancelOrigin: 'oauth_access_denied'});
    } finally {
      platform.restore();
    }
    captureSocialLoginError('google', {...cancelledError, cancelOrigin: 'browser_cancel'});

    expect(Sentry.withScope).not.toHaveBeenCalled();
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});

describe('captureShareLoginHandoffError', () => {
  test('아는 코드는 제목과 태그를 붙여 보낸다', () => {
    captureShareLoginHandoffError('SHARE_LOGIN_STATE_READ_FAILED');

    const [captured] = (Sentry.captureException as jest.Mock).mock.calls[0] as [Error];
    expect(captured.name).toBe('장소 공유 오류 · 로그인 상태 확인');
    expect(captured.message).toContain('환경·기기: 개발 · iOS');
    expect(mockScope.setTag).toHaveBeenCalledWith('share.error_code', 'SHARE_LOGIN_STATE_READ_FAILED');
  });

  test('모르는 코드는 보내지 않는다', () => {
    captureShareLoginHandoffError('UNKNOWN_CODE');

    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});
