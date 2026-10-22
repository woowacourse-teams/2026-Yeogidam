import {InAppBrowser} from 'react-native-inappbrowser-reborn';
import {Linking, Platform} from 'react-native';

import {
  getSpringAuthorizationUrl,
  type SpringLoginResponse,
} from '../src/lib/api/spring-auth-api';
import {
  getSpringAppleFullName,
  getSpringOAuthAuthorizationCode,
  getSpringOAuthCode,
  signInWithSpringOAuth,
} from '../src/lib/auth/spring-sign-in';
import {loginWithSpringAuthorizationCode} from '../src/lib/auth/spring-session';

jest.mock('../src/lib/api/spring-auth-api', () => ({
  getSpringAuthorizationUrl: jest.fn(),
}));
jest.mock('../src/lib/auth/spring-session', () => ({
  loginWithSpringAuthorizationCode: jest.fn(),
}));

beforeEach(() => {
  jest.mocked(getSpringAuthorizationUrl).mockReset();
  jest.mocked(loginWithSpringAuthorizationCode).mockReset();
  jest.mocked(InAppBrowser.isAvailable).mockResolvedValue(true);
  jest.mocked(InAppBrowser.openAuth).mockReset();
});

test('서버 콜백의 제공자와 인가 코드를 확인한다', () => {
  expect(
    getSpringOAuthCode(
      'com.yeogidamm.app://auth-callback?provider=kakao&code=one-time-code',
      'kakao',
    ),
  ).toBe('one-time-code');

  expect(() =>
    getSpringOAuthCode(
      'com.yeogidamm.app://auth-callback?provider=google&code=one-time-code',
      'kakao',
    ),
  ).toThrow();
  expect(() =>
    getSpringOAuthCode(
      'https://other.example/auth-callback?provider=kakao&code=one-time-code',
      'kakao',
    ),
  ).toThrow();
  let deniedError: unknown;
  try {
    getSpringOAuthCode(
      'com.yeogidamm.app://auth-callback?provider=kakao&error=access_denied',
      'kakao',
    );
  } catch (error) {
    deniedError = error;
  }
  expect(deniedError).toMatchObject({
    errorCode: 'AUTH000_001',
    cancelOrigin: 'oauth_access_denied',
  });
});

test.each(['cancel', 'dismiss'] as const)(
  '안드로이드 브라우저가 %s 결과를 반환하고 콜백이 없으면 종료 경로를 남긴다',
  async browserResult => {
    const platform = jest.replaceProperty(Platform, 'OS', 'android');
    const addEventListener = jest.spyOn(Linking, 'addEventListener').mockImplementation(
      () => ({remove: jest.fn()} as unknown as ReturnType<typeof Linking.addEventListener>),
    );
    jest.useFakeTimers();
    try {
      jest.mocked(getSpringAuthorizationUrl).mockResolvedValue(
        'https://accounts.google.com/o/oauth2/v2/auth?state=valid',
      );
      jest.mocked(InAppBrowser.openAuth).mockResolvedValue({type: browserResult});

      const authorizationCode = getSpringOAuthAuthorizationCode('google');
      const result = authorizationCode.catch(error => error);
      await jest.runAllTimersAsync();
      expect(await result).toMatchObject({
        errorCode: 'AUTH000_001',
        cancelOrigin: `browser_${browserResult}`,
        stage: 'provider_authorization',
      });
    } finally {
      jest.useRealTimers();
      addEventListener.mockRestore();
      platform.restore();
    }
  },
);

test('안드로이드에서 브라우저 취소가 딥링크보다 먼저 와도 인가 코드를 받는다', async () => {
  const platform = jest.replaceProperty(Platform, 'OS', 'android');
  let emitUrl: ((event: {url: string}) => void) | undefined;
  const addEventListener = jest.spyOn(Linking, 'addEventListener').mockImplementation(
    (_event, listener) => {
      emitUrl = listener as (event: {url: string}) => void;
      return {remove: jest.fn()} as unknown as ReturnType<typeof Linking.addEventListener>;
    },
  );
  try {
    jest.mocked(getSpringAuthorizationUrl).mockResolvedValue(
      'https://kauth.kakao.com/oauth/authorize?state=valid',
    );
    jest.mocked(InAppBrowser.openAuth).mockResolvedValue({type: 'cancel'});

    const authorizationCode = getSpringOAuthAuthorizationCode('kakao');
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    emitUrl?.({url: 'com.yeogidamm.app://auth-callback?provider=kakao&code=late-code'});

    await expect(authorizationCode).resolves.toBe('late-code');
    expect(InAppBrowser.openAuth).toHaveBeenCalledWith(
      'https://kauth.kakao.com/oauth/authorize?state=valid',
      'com.yeogidamm.app://auth-callback',
      expect.objectContaining({showInRecents: true}),
    );
    expect(InAppBrowser.closeAuth).toHaveBeenCalled();
  } finally {
    addEventListener.mockRestore();
    platform.restore();
  }
});

test('카카오 브라우저 인증 코드를 Spring 로그인 API에 교환한다', async () => {
  jest.mocked(getSpringAuthorizationUrl).mockResolvedValue(
    'https://kauth.kakao.com/oauth/authorize?state=valid',
  );
  jest.mocked(InAppBrowser.openAuth).mockResolvedValue({
    type: 'success',
    url: 'com.yeogidamm.app://auth-callback?provider=kakao&code=one-time-code',
  });
  const login: SpringLoginResponse = {
    accessToken: 'spring-access',
    refreshToken: 'spring-refresh',
    tokenType: 'Bearer',
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    refreshTokenExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    member: {id: 1, nickname: '담이', email: null, imageUrl: null, oauthProvider: 'KAKAO'},
  };
  jest.mocked(loginWithSpringAuthorizationCode).mockResolvedValue(login);

  await expect(signInWithSpringOAuth('kakao')).resolves.toBe(login);
  expect(loginWithSpringAuthorizationCode).toHaveBeenCalledWith(
    'kakao',
    'one-time-code',
  );
  expect(InAppBrowser.closeAuth).toHaveBeenCalled();
});

test('애플 이름은 한글과 영문 순서에 맞춰 전달한다', () => {
  type FullName = Parameters<typeof getSpringAppleFullName>[0];
  expect(getSpringAppleFullName({familyName: '홍', givenName: '길동'} as FullName))
    .toBe('홍길동');
  expect(getSpringAppleFullName({familyName: 'Kim', givenName: 'Minsu'} as FullName))
    .toBe('Minsu Kim');
  expect(getSpringAppleFullName(null)).toBeNull();
});
