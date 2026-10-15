import {InAppBrowser} from 'react-native-inappbrowser-reborn';

import {
  getSpringAuthorizationUrl,
  type SpringLoginResponse,
} from '../src/lib/api/spring-auth-api';
import {
  getSpringAppleFullName,
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
