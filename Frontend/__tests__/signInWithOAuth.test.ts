import { InAppBrowser } from 'react-native-inappbrowser-reborn';

import { configureLoginApi } from '../src/lib/auth/loginApi';
import {
  AUTH_CALLBACK_URL,
  getAuthorizationCodeFromCallback,
  reauthenticateWithOAuth,
  signInWithOAuth,
} from '../src/lib/auth/signInWithOAuth';
import { startSession } from '../src/lib/auth/tokenClient';

jest.mock('../src/lib/auth/tokenClient', () => ({
  startSession: jest.fn(() => Promise.resolve()),
}));

const BASE_URL = 'https://api.example.com';
const KAKAO_AUTHORIZATION_URL =
  'https://kauth.kakao.com/oauth/authorize?client_id=abc123&response_type=code&state=signed-state';
const GOOGLE_AUTHORIZATION_URL =
  'https://accounts.google.com/o/oauth2/v2/auth?client_id=abc123&response_type=code&state=signed-state';

const loginResponse = {
  accessToken: 'login-access-token',
  refreshToken: 'login-refresh-token',
  tokenType: 'Bearer',
  expiresAt: '2026-10-11T04:00:00Z',
  refreshTokenExpiresAt: '2026-12-11T03:00:00Z',
  member: {
    id: 1,
    nickname: '담이 1234',
    email: 'user1@example.com',
    imageUrl: null,
    oauthProvider: 'KAKAO',
  },
};

function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

/** 서버 콜백이 302로 보내는 앱 스킴 주소입니다. */
function callbackUrl(query: string) {
  return `${AUTH_CALLBACK_URL}?${query}`;
}

function catchError(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }

  return undefined;
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  jest.clearAllMocks();
  configureLoginApi({ baseUrl: BASE_URL });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('auth callback parsing', () => {
  it('reads the authorization code sent for the requested provider', () => {
    expect(
      getAuthorizationCodeFromCallback(
        callbackUrl('provider=kakao&code=kakao-code'),
        'kakao',
      ),
    ).toBe('kakao-code');
    // 구글 인가 코드에는 '/'가 들어 있고, 인코딩되어 와도 디코딩한 값을 씁니다.
    expect(
      getAuthorizationCodeFromCallback(
        callbackUrl('provider=google&code=4/0Ab-google-code'),
        'google',
      ),
    ).toBe('4/0Ab-google-code');
    expect(
      getAuthorizationCodeFromCallback(
        callbackUrl('provider=google&code=4%2F0Ab-google-code'),
        'google',
      ),
    ).toBe('4/0Ab-google-code');
  });

  it('treats access_denied as a cancellation and other provider errors as processing errors', () => {
    expect(
      catchError(() =>
        getAuthorizationCodeFromCallback(
          callbackUrl('provider=kakao&error=access_denied'),
          'kakao',
        ),
      ),
    ).toMatchObject({ errorCode: 'AUTH000_001', retryable: false });
    expect(
      catchError(() =>
        getAuthorizationCodeFromCallback(
          callbackUrl('provider=kakao&error=server_error'),
          'kakao',
        ),
      ),
    ).toMatchObject({ errorCode: 'CLIENT000_003', retryable: false });
  });

  it.each([
    ['another provider', 'provider=google&code=google-code'],
    ['no provider', 'code=kakao-code'],
    ['no code', 'provider=kakao'],
  ])('rejects a callback with %s', (_case, query) => {
    expect(
      catchError(() =>
        getAuthorizationCodeFromCallback(callbackUrl(query), 'kakao'),
      ),
    ).toMatchObject({ errorCode: 'CLIENT000_003' });
  });
});

describe('kakao and google login', () => {
  it('logs in with the code from the server callback and starts the session', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, { authorizationUrl: KAKAO_AUTHORIZATION_URL }),
      )
      .mockResolvedValueOnce(jsonResponse(200, loginResponse));
    globalThis.fetch = fetchMock;
    jest.mocked(InAppBrowser.openAuth).mockResolvedValueOnce({
      type: 'success',
      url: callbackUrl('provider=kakao&code=kakao-code'),
    });

    await expect(signInWithOAuth('kakao')).resolves.toBeUndefined();

    // 인가 URL은 로그인하기 전에 받으므로 토큰을 싣지 않습니다.
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `${BASE_URL}/oauth/kakao/authorize`,
      { method: 'GET', headers: { Accept: 'application/json' } },
    );
    expect(InAppBrowser.openAuth).toHaveBeenCalledWith(
      KAKAO_AUTHORIZATION_URL,
      AUTH_CALLBACK_URL,
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `${BASE_URL}/api/v1/auth/logins/kakao`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ authorizationCode: 'kakao-code' }),
      },
    );
    expect(startSession).toHaveBeenCalledWith(loginResponse, 1);
    expect(InAppBrowser.closeAuth).toHaveBeenCalled();
  });

  it.each([
    ['the user closes the browser', { type: 'cancel' as const }],
    [
      'the provider sends the user back with access_denied',
      {
        type: 'success' as const,
        url: callbackUrl('provider=kakao&error=access_denied'),
      },
    ],
  ])(
    'stays signed out without calling the login API when %s',
    async (_case, browserResult) => {
      const fetchMock = jest
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(200, { authorizationUrl: KAKAO_AUTHORIZATION_URL }),
        );
      globalThis.fetch = fetchMock;
      jest.mocked(InAppBrowser.openAuth).mockResolvedValueOnce(browserResult);

      await expect(signInWithOAuth('kakao')).rejects.toMatchObject({
        errorCode: 'AUTH000_001',
        message: '로그인이 취소됐어요.',
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(startSession).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      401,
      'AUTH401_002',
      '소셜 로그인 인증 정보가 유효하지 않습니다.',
      '로그인을 완료하지 못했어요. 다시 시도해주세요.',
      false,
    ],
    [
      502,
      'AUTH502_001',
      '소셜 로그인 제공자에 연결할 수 없습니다.',
      '로그인 제공자 연결이 원활하지 않아요.',
      true,
    ],
  ])(
    'maps %s %s from the login API to the login message without starting a session',
    async (status, errorCode, serverMessage, message, retryable) => {
      globalThis.fetch = jest
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(200, { authorizationUrl: GOOGLE_AUTHORIZATION_URL }),
        )
        .mockResolvedValueOnce(
          jsonResponse(
            status,
            { message: serverMessage, errorCode },
            { 'X-Request-Id': 'request-1' },
          ),
        );
      jest.mocked(InAppBrowser.openAuth).mockResolvedValueOnce({
        type: 'success',
        url: callbackUrl('provider=google&code=google-code'),
      });

      await expect(signInWithOAuth('google')).rejects.toEqual({
        status,
        errorCode,
        message,
        retryable,
        requestId: 'request-1',
      });
      expect(startSession).not.toHaveBeenCalled();
    },
  );
});

describe('re-authentication for account deletion', () => {
  it('returns the new authorization code without sending it to the login API', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, { authorizationUrl: GOOGLE_AUTHORIZATION_URL }),
      );
    globalThis.fetch = fetchMock;
    jest.mocked(InAppBrowser.openAuth).mockResolvedValueOnce({
      type: 'success',
      url: callbackUrl('provider=google&code=google-code'),
    });

    await expect(reauthenticateWithOAuth('google')).resolves.toBe(
      'google-code',
    );

    // 인가 코드는 한 번만 쓸 수 있어 탈퇴 요청에만 담습니다.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/oauth/google/authorize`,
      expect.objectContaining({ method: 'GET' }),
    );
    expect(startSession).not.toHaveBeenCalled();
  });
});
