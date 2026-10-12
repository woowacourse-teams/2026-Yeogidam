import { createServerCurrentProfileRepository } from '../src/entities/info/api';
import { ApiError } from '../src/lib/api/errors';

const BASE_URL = 'https://api.example.com';

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

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
});

describe('current profile', () => {
  it('reads the member with the access token and maps it to the profile', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        id: 1,
        nickname: '담이 1234',
        email: 'user1@example.com',
        imageUrl: 'https://img.example.com/profile/1.jpg',
        oauthProvider: 'KAKAO',
      }),
    );
    globalThis.fetch = fetchMock;
    const repository = createServerCurrentProfileRepository({
      baseUrl: BASE_URL,
      getAccessToken: async () => 'access-token',
    });

    await expect(repository.getCurrentProfile()).resolves.toEqual({
      id: '1',
      nickname: '담이 1234',
      email: 'user1@example.com',
      avatarUrl: 'https://img.example.com/profile/1.jpg',
      oauthProvider: 'KAKAO',
    });
    expect(fetchMock).toHaveBeenCalledWith(`${BASE_URL}/api/v1/members/me`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer access-token',
      },
    });
  });

  it('keeps the fields the provider did not share as null', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        id: 2,
        nickname: '담이 5678',
        email: null,
        imageUrl: null,
        oauthProvider: 'APPLE',
      }),
    );
    const repository = createServerCurrentProfileRepository({
      baseUrl: BASE_URL,
      getAccessToken: async () => 'access-token',
    });

    await expect(repository.getCurrentProfile()).resolves.toEqual({
      id: '2',
      nickname: '담이 5678',
      email: null,
      avatarUrl: null,
      oauthProvider: 'APPLE',
    });
  });

  it('passes USER404_001 through without a second request', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(
        jsonResponse(
          404,
          { message: '존재하지 않는 사용자입니다.', errorCode: 'USER404_001' },
          { 'X-Request-Id': 'request-1' },
        ),
      );
    globalThis.fetch = fetchMock;
    const repository = createServerCurrentProfileRepository({
      baseUrl: BASE_URL,
      getAccessToken: async () => 'access-token',
    });

    const result = repository.getCurrentProfile();

    await expect(result).rejects.toBeInstanceOf(ApiError);
    await expect(result).rejects.toMatchObject({
      status: 404,
      errorCode: 'USER404_001',
      requestId: 'request-1',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
