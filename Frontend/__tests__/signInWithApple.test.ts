import { appleAuth } from '@invertase/react-native-apple-authentication';

import { configureLoginApi } from '../src/lib/auth/loginApi';
import {
  reauthenticateWithApple,
  signInWithApple,
  toAppleFullName,
} from '../src/lib/auth/signInWithApple';
import { startSession } from '../src/lib/auth/tokenClient';

jest.mock('../src/lib/auth/tokenClient', () => ({
  startSession: jest.fn(() => Promise.resolve()),
}));

const BASE_URL = 'https://api.example.com';

type AppleFullName = Parameters<typeof toAppleFullName>[0];

const loginResponse = {
  accessToken: 'login-access-token',
  refreshToken: 'login-refresh-token',
  tokenType: 'Bearer',
  expiresAt: '2026-10-11T04:00:00Z',
  refreshTokenExpiresAt: '2026-12-11T03:00:00Z',
  member: {
    id: 2,
    nickname: '홍길동',
    email: null,
    imageUrl: null,
    oauthProvider: 'APPLE',
  },
};

/** 기기 로그인 창의 결과 가운데 앱이 읽는 두 필드만 채웁니다. */
function appleCredential(
  authorizationCode: string | null,
  fullName: AppleFullName,
) {
  return { authorizationCode, fullName } as Awaited<
    ReturnType<typeof appleAuth.performRequest>
  >;
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function loginRequest(body: unknown) {
  return [
    `${BASE_URL}/api/v1/auth/logins/apple`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  ];
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  jest.clearAllMocks();
  configureLoginApi({ baseUrl: BASE_URL });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('apple full name', () => {
  it.each([
    [
      'joins a Korean family name and given name without a space',
      { familyName: '홍', givenName: '길동' },
      '홍길동',
    ],
    [
      'writes other names as given name then family name',
      { familyName: 'Kim', givenName: 'Minsu' },
      'Minsu Kim',
    ],
    [
      'uses the only part that is present',
      { familyName: null, givenName: ' 길동 ' },
      '길동',
    ],
  ])('%s', (_case, fullName, expected) => {
    expect(toAppleFullName(fullName)).toBe(expected);
  });

  it('returns undefined when Apple sends no name', () => {
    expect(toAppleFullName(null)).toBeUndefined();
    expect(
      toAppleFullName({ familyName: ' ', givenName: null }),
    ).toBeUndefined();
  });

  it('cuts the name to the 255 characters the server accepts', () => {
    expect(
      toAppleFullName({ familyName: 'Kim', givenName: 'a'.repeat(300) }),
    ).toBe('a'.repeat(255));
  });

  it('does not leave half of a surrogate pair at the cut', () => {
    expect(
      toAppleFullName({ familyName: null, givenName: `${'a'.repeat(254)}😀` }),
    ).toBe('a'.repeat(254));
  });
});

describe('apple login', () => {
  it('sends the authorization code with the first-time name and starts the session', async () => {
    jest
      .mocked(appleAuth.performRequest)
      .mockResolvedValueOnce(
        appleCredential('apple-code', { familyName: '홍', givenName: '길동' }),
      );
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, loginResponse));
    globalThis.fetch = fetchMock;

    await expect(signInWithApple()).resolves.toBeUndefined();

    // nonce는 더 보내지 않습니다.
    expect(appleAuth.performRequest).toHaveBeenCalledWith({
      requestedOperation: appleAuth.Operation.LOGIN,
      requestedScopes: [appleAuth.Scope.FULL_NAME, appleAuth.Scope.EMAIL],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      ...loginRequest({ authorizationCode: 'apple-code', fullName: '홍길동' }),
    );
    expect(startSession).toHaveBeenCalledWith(loginResponse, 2);
  });

  it('leaves fullName out when Apple sends no name on a later sign-in', async () => {
    jest
      .mocked(appleAuth.performRequest)
      .mockResolvedValueOnce(appleCredential('apple-code', null));
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, loginResponse));
    globalThis.fetch = fetchMock;

    await expect(signInWithApple()).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith(
      ...loginRequest({ authorizationCode: 'apple-code' }),
    );
  });

  it('turns a cancelled Apple sheet into a cancellation without calling the server', async () => {
    jest
      .mocked(appleAuth.performRequest)
      .mockRejectedValueOnce({ code: appleAuth.Error.CANCELED });
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock;

    await expect(signInWithApple()).rejects.toMatchObject({
      errorCode: 'AUTH000_001',
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(startSession).not.toHaveBeenCalled();
  });

  it('returns the authorization code for account deletion without logging in', async () => {
    jest
      .mocked(appleAuth.performRequest)
      .mockResolvedValueOnce(appleCredential('apple-code', null));
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock;

    await expect(reauthenticateWithApple()).resolves.toBe('apple-code');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(startSession).not.toHaveBeenCalled();
  });
});
