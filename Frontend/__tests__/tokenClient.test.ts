import { createApiClient } from '../src/lib/api/client';
import { ApiError } from '../src/lib/api/errors';
import {
  configureTokenClient,
  getAccessToken,
  logout,
  refreshSession,
  startSession,
  subscribeAuthState,
  type ServerTokenResponse,
} from '../src/lib/auth/tokenClient';
import type {
  NativeAccessTokenResult,
  NativeShareSession,
} from '../src/lib/share-intent';

const BASE_URL = 'https://api.example.com';

/** 앱과 공유 확장이 함께 쓰는 네이티브 저장소를 메모리로 흉내 냅니다. */
const mockNativeStore: { session: NativeShareSession | null } = {
  session: null,
};
const mockEnsureNativeAccessToken = jest.fn<
  Promise<NativeAccessTokenResult | null>,
  [string | null]
>();

jest.mock('../src/lib/share-intent', () => ({
  getShareSession: () => Promise.resolve(mockNativeStore.session),
  setShareSession: (session: typeof mockNativeStore.session) => {
    mockNativeStore.session = session;
    return Promise.resolve();
  },
  ensureNativeAccessToken: (rejectedAccessToken: string | null) =>
    mockEnsureNativeAccessToken(rejectedAccessToken),
}));

function nowInSeconds() {
  return Math.floor(Date.now() / 1000);
}

/** 만료가 60초 안으로 다가온 세션입니다. */
function expiringSession(): NativeShareSession {
  return {
    accessToken: 'old-access-token',
    refreshToken: 'old-refresh-token',
    expiresAt: nowInSeconds() + 30,
    userId: '7',
  };
}

/** 기기 시계로는 한 시간 남은 세션입니다. */
function freshSession(accessToken = 'old-access-token'): NativeShareSession {
  return {
    ...expiringSession(),
    accessToken,
    expiresAt: nowInSeconds() + 3600,
  };
}

/** 서버처럼 초 단위로 자른 만료 시각을 싣습니다. */
function tokenResponse(name: string): ServerTokenResponse {
  return {
    accessToken: `${name}-access-token`,
    refreshToken: `${name}-refresh-token`,
    tokenType: 'Bearer',
    expiresAt: new Date(Date.now() + 30 * 60_000)
      .toISOString()
      .replace(/\.\d{3}Z$/, 'Z'),
    refreshTokenExpiresAt: '2026-12-11T03:00:00Z',
  };
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function serverErrorResponse(status: number, errorCode: string) {
  const messages: Record<string, string> = {
    AUTH401_001: '인증 토큰이 유효하지 않습니다.',
    AUTH401_003: '이미 사용된 리프레시 토큰입니다. 다시 로그인해 주세요.',
    COMMON500_001: '예기치 못한 예외가 발생했습니다.',
  };

  return jsonResponse(status, { message: messages[errorCode], errorCode });
}

/** nginx가 직접 끝낸 응답은 JSON 본문이 없습니다. */
function nginxResponse(status: number) {
  return new Response(`<html><body><h1>${status}</h1></body></html>`, {
    status,
    headers: { 'Content-Type': 'text/html' },
  });
}

function refreshRequest(refreshToken: string) {
  return [
    `${BASE_URL}/api/v1/auth/token-refreshes`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken }),
    },
  ];
}

const originalFetch = globalThis.fetch;
let unsubscribe: (() => void) | undefined;

beforeEach(() => {
  mockNativeStore.session = null;
  mockEnsureNativeAccessToken.mockReset();
  mockEnsureNativeAccessToken.mockResolvedValue(null);
  configureTokenClient({ baseUrl: BASE_URL });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  unsubscribe?.();
  unsubscribe = undefined;
});

describe('token refresh', () => {
  it('shares one refresh among three concurrent callers and stores the new pair', async () => {
    mockNativeStore.session = expiringSession();
    const tokens = tokenResponse('new');
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, tokens));
    globalThis.fetch = fetchMock;

    await expect(
      Promise.all([getAccessToken(), getAccessToken(), getAccessToken()]),
    ).resolves.toEqual([
      tokens.accessToken,
      tokens.accessToken,
      tokens.accessToken,
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      ...refreshRequest('old-refresh-token'),
    );
    expect(mockNativeStore.session).toEqual({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: Date.parse(tokens.expiresAt) / 1000,
      userId: '7',
    });

    await expect(getAccessToken()).resolves.toBe(tokens.accessToken);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('skips the server when another request already replaced the rejected token', async () => {
    mockNativeStore.session = freshSession('newer-access-token');
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock;

    await expect(refreshSession('old-access-token')).resolves.toBe(true);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('prefers the native refresh entry point when the binary has one', async () => {
    mockNativeStore.session = expiringSession();
    mockEnsureNativeAccessToken.mockResolvedValue({
      status: 'READY',
      accessToken: 'native-access-token',
    });
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock;

    await expect(getAccessToken()).resolves.toBe('native-access-token');
    await expect(refreshSession('old-access-token')).resolves.toBe(true);

    expect(mockEnsureNativeAccessToken).toHaveBeenNthCalledWith(1, null);
    expect(mockEnsureNativeAccessToken).toHaveBeenNthCalledWith(
      2,
      'old-access-token',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('retry after AUTH401_001', () => {
  function createRequest() {
    return createApiClient({
      baseUrl: BASE_URL,
      getAccessToken,
      refreshSession,
    });
  }

  it('refreshes once and resends the request with the new token', async () => {
    // 기기 시계가 느려 앱은 살아 있다고 본 토큰을 서버가 거절한 경우입니다.
    mockNativeStore.session = freshSession();
    const tokens = tokenResponse('new');
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(serverErrorResponse(401, 'AUTH401_001'))
      .mockResolvedValueOnce(jsonResponse(200, tokens))
      .mockResolvedValueOnce(jsonResponse(200, { id: 7 }));
    globalThis.fetch = fetchMock;

    await expect(createRequest()('/api/v1/members/me')).resolves.toEqual({
      id: 7,
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      ...refreshRequest('old-refresh-token'),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      `${BASE_URL}/api/v1/members/me`,
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${tokens.accessToken}`,
        }),
      }),
    );
  });

  it('does not refresh or retry a second time when the new token is rejected too', async () => {
    mockNativeStore.session = freshSession();
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(serverErrorResponse(401, 'AUTH401_001'))
      .mockResolvedValueOnce(jsonResponse(200, tokenResponse('new')))
      .mockResolvedValueOnce(serverErrorResponse(401, 'AUTH401_001'));
    globalThis.fetch = fetchMock;

    const error = await createRequest()('/api/v1/members/me').catch(
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401, errorCode: 'AUTH401_001' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('ends the request with the refresh failure instead of AUTH401_001 and keeps the session when the refresh gets a 429', async () => {
    const session = freshSession();
    mockNativeStore.session = session;
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(serverErrorResponse(401, 'AUTH401_001'))
      .mockResolvedValueOnce(nginxResponse(429));
    globalThis.fetch = fetchMock;

    const error = await createRequest()('/api/v1/members/me').catch(
      (reason: unknown) => reason,
    );

    // 화면은 AUTH401_001을 로그인 필요로 보므로, 세션이 남은 일시 실패는 재발급 오류로 끝나야 합니다.
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 503, errorCode: 'DATA500_001' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mockNativeStore.session).toEqual(session);
  });
});

describe('refresh failure classification', () => {
  it.each(['AUTH401_001', 'AUTH401_003'])(
    'ends the session when the refresh gets %s',
    async errorCode => {
      mockNativeStore.session = expiringSession();
      globalThis.fetch = jest
        .fn()
        .mockResolvedValue(serverErrorResponse(401, errorCode));
      const listener = jest.fn();
      unsubscribe = subscribeAuthState(listener);

      await expect(getAccessToken()).resolves.toBeNull();

      expect(mockNativeStore.session).toBeNull();
      expect(listener).toHaveBeenCalledWith(false);
    },
  );

  // 네이티브 결과에는 상태 코드가 없어 429와 5xx는 모두 본문 없는 503으로 바뀝니다.
  const refreshUnavailable = { status: 503, errorCode: 'DATA500_001' };
  const transientFailures: Array<
    [string, () => Promise<Response>, Pick<ApiError, 'status' | 'errorCode'>]
  > = [
    [
      'a 429 from nginx',
      () => Promise.resolve(nginxResponse(429)),
      refreshUnavailable,
    ],
    [
      'a 502 from nginx',
      () => Promise.resolve(nginxResponse(502)),
      refreshUnavailable,
    ],
    [
      'a 500 from the server',
      () => Promise.resolve(serverErrorResponse(500, 'COMMON500_001')),
      refreshUnavailable,
    ],
    [
      'a network error',
      () => Promise.reject(new TypeError('Network request failed')),
      { status: null, errorCode: 'CLIENT000_001' },
    ],
  ];

  it.each(transientFailures)(
    'keeps the session when the refresh fails with %s',
    async (_failure, respond, expectedError) => {
      const session = expiringSession();
      mockNativeStore.session = session;
      globalThis.fetch = jest.fn().mockImplementation(respond);
      const listener = jest.fn();
      unsubscribe = subscribeAuthState(listener);

      // 선제 갱신이 실패해도 아직 살아 있는 토큰으로 요청을 보냅니다.
      await expect(getAccessToken()).resolves.toBe(session.accessToken);
      await expect(refreshSession(session.accessToken)).rejects.toMatchObject(
        expectedError,
      );

      expect(mockNativeStore.session).toEqual(session);
      expect(listener).not.toHaveBeenCalled();
    },
  );
});

describe('session start and logout', () => {
  it('stores the login tokens with the member id as a string and announces the sign-in', async () => {
    const tokens = tokenResponse('login');
    const listener = jest.fn();
    unsubscribe = subscribeAuthState(listener);

    await startSession(tokens, 42);

    expect(mockNativeStore.session).toEqual({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: Date.parse(tokens.expiresAt) / 1000,
      userId: '42',
    });
    expect(listener).toHaveBeenCalledWith(true);
  });

  const serverLogoutOutcomes: Array<[string, () => Promise<Response>]> = [
    ['succeeds', () => Promise.resolve(new Response(null, { status: 204 }))],
    [
      'rejects an expired refresh token',
      () => Promise.resolve(serverErrorResponse(401, 'AUTH401_001')),
    ],
    [
      'cannot be reached',
      () => Promise.reject(new TypeError('Network request failed')),
    ],
  ];

  it.each(serverLogoutOutcomes)(
    'clears the local session when the server logout %s',
    async (_outcome, respond) => {
      mockNativeStore.session = freshSession();
      const fetchMock = jest.fn().mockImplementation(respond);
      globalThis.fetch = fetchMock;
      const listener = jest.fn();
      unsubscribe = subscribeAuthState(listener);

      await expect(logout()).resolves.toBeUndefined();

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE_URL}/api/v1/auth/logouts`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ refreshToken: 'old-refresh-token' }),
        }),
      );
      expect(mockNativeStore.session).toBeNull();
      expect(listener).toHaveBeenCalledWith(false);
    },
  );
});
