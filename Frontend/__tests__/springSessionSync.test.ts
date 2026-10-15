import * as Keychain from 'react-native-keychain';

import {
  exchangeSpringAuthorizationCode,
  refreshSpringTokens,
  revokeSpringSession,
  type SpringTokenPair,
} from '../src/lib/api/spring-auth-api';
import {ApiError} from '../src/lib/api/errors';
import {
  clearSpringSession,
  getSpringMemberId,
  getSpringTokens,
  loginWithSpringAuthorizationCode,
  logoutSpringSession,
  onSpringSessionChange,
  refreshSpringSession,
} from '../src/lib/auth/spring-session';
import {
  getShareSession,
  syncShareSession,
  type NativeShareSession,
} from '../src/lib/share-intent';

jest.mock('../src/lib/api/spring-auth-api', () => ({
  exchangeSpringAuthorizationCode: jest.fn(),
  refreshSpringTokens: jest.fn(),
  revokeSpringSession: jest.fn(),
}));

let nativeSession: NativeShareSession | null;

jest.mock('../src/lib/share-intent', () => ({
  getShareSession: jest.fn(),
  syncShareSession: jest.fn(),
}));

const at = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();
const tokens = (accessToken: string, refreshToken: string, minutes: number): SpringTokenPair => ({
  accessToken,
  refreshToken,
  tokenType: 'Bearer',
  expiresAt: at(minutes),
  refreshTokenExpiresAt: at(60 * 24),
});

let stored: string | null;
const listener = jest.fn();
let unsubscribe: () => void;

beforeEach(() => {
  stored = null;
  nativeSession = null;
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
  jest.mocked(getShareSession).mockImplementation(async () => nativeSession);
  jest.mocked(syncShareSession).mockReset().mockImplementation(async session => {
    nativeSession = session;
  });
  jest.mocked(exchangeSpringAuthorizationCode).mockReset();
  jest.mocked(refreshSpringTokens).mockReset();
  jest.mocked(revokeSpringSession).mockReset();
  listener.mockReset();
  unsubscribe = onSpringSessionChange(listener);
});

afterEach(() => unsubscribe());

function storeSession(pair: SpringTokenPair, memberId: string | null = '7') {
  stored = JSON.stringify({...pair, memberId});
}

test('로그인하면 회원 ID를 저장하고 공유 세션을 epoch초로 동기화한 뒤 SIGNED_IN을 보낸다', async () => {
  const pair = tokens('access-1', 'refresh-1', 60);
  jest.mocked(exchangeSpringAuthorizationCode).mockResolvedValue({
    ...pair,
    member: {id: 7, nickname: null, email: null, imageUrl: null, oauthProvider: 'KAKAO'},
  });

  await loginWithSpringAuthorizationCode('kakao', 'code');

  expect(await getSpringMemberId()).toBe('7');
  expect(await getSpringTokens()).toEqual(pair);
  expect(syncShareSession).toHaveBeenCalledWith({
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    expiresAt: Math.floor(Date.parse(pair.expiresAt) / 1000),
    userId: '7',
  });
  expect(listener).toHaveBeenCalledWith('SIGNED_IN', '7');
});

test('공유 익스텐션이 먼저 회전한 같은 회원의 토큰을 채택한다', async () => {
  storeSession(tokens('access-1', 'refresh-1', 5));
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  nativeSession = {accessToken: 'access-ext', refreshToken: 'refresh-ext', expiresAt, userId: '7'};

  const adopted = await getSpringTokens();

  expect(adopted).toMatchObject({accessToken: 'access-ext', refreshToken: 'refresh-ext'});
  expect(Date.parse(adopted!.expiresAt)).toBe(expiresAt * 1000);
  expect(JSON.parse(stored!)).toMatchObject({refreshToken: 'refresh-ext', memberId: '7'});
  expect(listener).toHaveBeenCalledWith('TOKEN_REFRESHED', '7');
});

test('다른 회원이거나 더 오래된 공유 세션은 채택하지 않는다', async () => {
  storeSession(tokens('access-1', 'refresh-1', 60));
  nativeSession = {
    accessToken: 'other',
    refreshToken: 'other-refresh',
    expiresAt: Math.floor(Date.now() / 1000) + 7200,
    userId: '8',
  };
  expect((await getSpringTokens())?.refreshToken).toBe('refresh-1');

  nativeSession = {
    accessToken: 'old',
    refreshToken: 'old-refresh',
    expiresAt: Math.floor(Date.now() / 1000) + 60,
    userId: '7',
  };
  expect((await getSpringTokens())?.refreshToken).toBe('refresh-1');
  expect(listener).not.toHaveBeenCalled();
});

test('토큰 회전 시 공유 세션을 갱신하고 TOKEN_REFRESHED를 보낸다', async () => {
  storeSession(tokens('access-1', 'refresh-1', -1));
  jest.mocked(refreshSpringTokens).mockResolvedValue(tokens('access-2', 'refresh-2', 60));

  await refreshSpringSession();

  expect(nativeSession).toMatchObject({accessToken: 'access-2', refreshToken: 'refresh-2', userId: '7'});
  expect(listener).toHaveBeenCalledWith('TOKEN_REFRESHED', '7');
});

test('재사용 판정된 리프레시 토큰이면 세션을 지우고 SIGNED_OUT을 보낸다', async () => {
  storeSession(tokens('access-1', 'refresh-1', -1));
  nativeSession = {accessToken: 'access-1', refreshToken: 'refresh-1', expiresAt: 0, userId: '7'};
  jest.mocked(refreshSpringTokens).mockRejectedValue(
    new ApiError({kind: 'http', status: 401, errorCode: 'AUTH401_003', message: 'reused'}),
  );

  await expect(refreshSpringSession()).rejects.toBeInstanceOf(ApiError);

  expect(stored).toBeNull();
  expect(nativeSession).toBeNull();
  expect(listener).toHaveBeenCalledWith('SIGNED_OUT', '7');
});

test('로그아웃은 공유 세션을 먼저 지우고 서버 세션을 끝낸다', async () => {
  storeSession(tokens('access-1', 'refresh-1', 60));
  nativeSession = {accessToken: 'access-1', refreshToken: 'refresh-1', expiresAt: 1, userId: '7'};
  jest.mocked(revokeSpringSession).mockImplementation(async () => {
    expect(nativeSession).toBeNull();
  });

  await logoutSpringSession();

  expect(revokeSpringSession).toHaveBeenCalledWith('refresh-1');
  expect(stored).toBeNull();
  expect(listener).toHaveBeenCalledWith('SIGNED_OUT', '7');
});

test('서버 로그아웃이 실패하면 공유 세션을 되돌리고 오류를 전달한다', async () => {
  storeSession(tokens('access-1', 'refresh-1', 60));
  const shared = {accessToken: 'access-1', refreshToken: 'refresh-1', expiresAt: 1, userId: '7'};
  nativeSession = shared;
  jest.mocked(revokeSpringSession).mockRejectedValue(
    new ApiError({kind: 'network', message: 'offline'}),
  );

  await expect(logoutSpringSession()).rejects.toBeInstanceOf(ApiError);

  expect(nativeSession).toEqual(shared);
  expect(stored).not.toBeNull();
  expect(listener).not.toHaveBeenCalledWith('SIGNED_OUT', expect.anything());
});

test('clearSpringSession은 서버 호출 없이 세션을 지운다', async () => {
  storeSession(tokens('access-1', 'refresh-1', 60));

  await clearSpringSession();

  expect(revokeSpringSession).not.toHaveBeenCalled();
  expect(stored).toBeNull();
  expect(syncShareSession).toHaveBeenCalledWith(null);
  expect(listener).toHaveBeenCalledWith('SIGNED_OUT', '7');
});
