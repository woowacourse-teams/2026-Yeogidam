import * as Keychain from 'react-native-keychain';

import {
  exchangeSpringAuthorizationCode,
  refreshSpringTokens,
  revokeSpringSession,
  type SpringLoginResponse,
  type SpringTokenPair,
} from '../src/lib/api/spring-auth-api';
import {ApiError} from '../src/lib/api/errors';
import {
  getSpringAccessToken,
  getSpringTokens,
  loginWithSpringAuthorizationCode,
  logoutSpringSession,
  refreshSpringSession,
} from '../src/lib/auth/spring-session';

jest.mock('../src/lib/api/spring-auth-api', () => ({
  exchangeSpringAuthorizationCode: jest.fn(),
  refreshSpringTokens: jest.fn(),
  revokeSpringSession: jest.fn(),
}));

const future = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();
const tokens = (accessToken: string, refreshToken: string, minutes: number): SpringTokenPair => ({
  accessToken,
  refreshToken,
  tokenType: 'Bearer',
  expiresAt: future(minutes),
  refreshTokenExpiresAt: future(60 * 24),
});

let stored: string | null;

beforeEach(() => {
  stored = null;
  (Keychain.getGenericPassword as jest.Mock).mockImplementation(async () =>
    stored ? {username: 'spring-auth', password: stored} : false,
  );
  (Keychain.setGenericPassword as jest.Mock).mockImplementation(async (_username, value) => {
    stored = value;
    return true;
  });
  (Keychain.resetGenericPassword as jest.Mock).mockImplementation(async () => {
    stored = null;
    return true;
  });
  jest.mocked(exchangeSpringAuthorizationCode).mockReset();
  jest.mocked(refreshSpringTokens).mockReset();
  jest.mocked(revokeSpringSession).mockReset();
});

test('로그인 응답의 토큰 쌍을 Keychain에 저장하고 액세스 토큰을 읽는다', async () => {
  const login: SpringLoginResponse = {
    ...tokens('access-1', 'refresh-1', 60),
    member: {id: 1, nickname: '담이', email: null, imageUrl: null, oauthProvider: 'GOOGLE'},
  };
  jest.mocked(exchangeSpringAuthorizationCode).mockResolvedValue(login);

  await loginWithSpringAuthorizationCode('google', 'authorization-code');

  expect(await getSpringAccessToken()).toBe('access-1');
  expect(await getSpringTokens()).toEqual({
    accessToken: login.accessToken,
    refreshToken: login.refreshToken,
    tokenType: login.tokenType,
    expiresAt: login.expiresAt,
    refreshTokenExpiresAt: login.refreshTokenExpiresAt,
  });
  expect(Keychain.setGenericPassword).toHaveBeenCalledWith(
    'spring-auth',
    expect.any(String),
    {service: 'com.yeogidamm.app.spring-auth'},
  );
});

test('동시 요청은 리프레시 토큰을 한 번만 회전하고 새 토큰을 저장한다', async () => {
  stored = JSON.stringify(tokens('expired-access', 'refresh-1', -1));
  jest.mocked(refreshSpringTokens).mockResolvedValue(tokens('access-2', 'refresh-2', 60));

  await expect(Promise.all([getSpringAccessToken(), getSpringAccessToken()]))
    .resolves.toEqual(['access-2', 'access-2']);
  expect(refreshSpringTokens).toHaveBeenCalledTimes(1);
  expect(refreshSpringTokens).toHaveBeenCalledWith('refresh-1');
  expect((await getSpringTokens())?.refreshToken).toBe('refresh-2');
});

test('재사용된 리프레시 토큰이면 저장된 세션을 지운다', async () => {
  stored = JSON.stringify(tokens('expired-access', 'refresh-1', -1));
  jest.mocked(refreshSpringTokens).mockRejectedValue(
    new ApiError({kind: 'http', status: 401, errorCode: 'AUTH401_003', message: 'reused'}),
  );

  await expect(refreshSpringSession()).rejects.toMatchObject({errorCode: 'AUTH401_003'});
  expect(await getSpringTokens()).toBeNull();
});

test('다른 쪽에서 막 교체한 토큰은 지우지 않는다', async () => {
  stored = JSON.stringify(tokens('expired-access', 'refresh-1', -1));
  jest.mocked(refreshSpringTokens).mockRejectedValue(
    new ApiError({kind: 'http', status: 401, errorCode: 'AUTH401_005', message: 'rotated'}),
  );

  // 새 토큰이 끝내 보이지 않으면 로그아웃 대신 다시 시도할 수 있는 오류로 알린다.
  await expect(refreshSpringSession()).rejects.toMatchObject({kind: 'timeout'});
  expect((await getSpringTokens())?.refreshToken).toBe('refresh-1');
});

test('로그아웃이 성공하면 서버 세션을 끝낸 뒤 로컬 토큰을 지운다', async () => {
  stored = JSON.stringify(tokens('access-1', 'refresh-1', 60));
  jest.mocked(revokeSpringSession).mockResolvedValue(undefined);

  await expect(logoutSpringSession()).resolves.toEqual({serverConfirmed: true});

  expect(revokeSpringSession).toHaveBeenCalledWith('refresh-1', {timeoutMs: 5_000});
  expect(await getSpringTokens()).toBeNull();
});
