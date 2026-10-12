import { ApiError } from '../src/lib/api/errors';
import { createServerAccountDeletionRepository } from '../src/lib/auth/deleteAccount';

const BASE_URL = 'https://api.example.com';
const AUTHORIZATION_CODE = 'example-authorization-code';

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

function createRepository(clearSession: () => Promise<void>) {
  return createServerAccountDeletionRepository({
    baseUrl: BASE_URL,
    getAccessToken: async () => 'access-token',
    requestAuthorizationCode: jest.fn(),
    clearSession,
  });
}

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
});

describe('account deletion', () => {
  it('sends the authorization code and clears the local session after 204', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    globalThis.fetch = fetchMock;
    const clearSession = jest.fn().mockResolvedValue(undefined);

    await expect(
      createRepository(clearSession).deleteAccount(AUTHORIZATION_CODE),
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith(`${BASE_URL}/api/v1/members/me`, {
      method: 'DELETE',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: 'Bearer access-token',
      },
      body: JSON.stringify({ authorizationCode: AUTHORIZATION_CODE }),
    });
    expect(clearSession).toHaveBeenCalledTimes(1);
  });

  it('treats USER404_001 as an account already deleted and clears the local session', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(
      jsonResponse(404, {
        message: '존재하지 않는 사용자입니다.',
        errorCode: 'USER404_001',
      }),
    );
    const clearSession = jest.fn().mockResolvedValue(undefined);

    await expect(
      createRepository(clearSession).deleteAccount(AUTHORIZATION_CODE),
    ).resolves.toBeUndefined();

    expect(clearSession).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      401,
      'AUTH401_002',
      '소셜 로그인 인증 정보가 유효하지 않습니다.',
      '계정 보호를 위해 다시 로그인해주세요.',
    ],
    [
      502,
      'AUTH502_001',
      '소셜 로그인 제공자에 연결할 수 없습니다.',
      '연결된 로그인 계정을 해제하지 못했어요.',
    ],
  ])(
    'maps %s %s to the deletion message and keeps the local session',
    async (status, errorCode, serverMessage, message) => {
      globalThis.fetch = jest
        .fn()
        .mockResolvedValue(
          jsonResponse(
            status,
            { message: serverMessage, errorCode },
            { 'X-Request-Id': 'request-1' },
          ),
        );
      const clearSession = jest.fn().mockResolvedValue(undefined);

      const result =
        createRepository(clearSession).deleteAccount(AUTHORIZATION_CODE);

      await expect(result).rejects.toBeInstanceOf(ApiError);
      await expect(result).rejects.toMatchObject({
        status,
        errorCode,
        message,
        requestId: 'request-1',
      });
      expect(clearSession).not.toHaveBeenCalled();
    },
  );
});
