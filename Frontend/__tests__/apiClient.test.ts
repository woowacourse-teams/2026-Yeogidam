import { trackApiRateLimited } from '../src/analytics/apiEvents';
import { createApiClient } from '../src/lib/api/client';
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

/** nginx가 직접 끝낸 응답은 X-Request-Id 없이 기본 HTML 본문을 줍니다. */
function nginxResponse(status: number) {
  return new Response(`<html><body><h1>${status}</h1></body></html>`, {
    status,
    headers: { 'Content-Type': 'text/html' },
  });
}

async function rejectionOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error;
  }

  throw new Error('Expected the request to fail.');
}

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
});

describe('api client', () => {
  it('sends the access token as a bearer header and keeps the cursor string as given', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(
        jsonResponse(200, { sharedMedias: [], nextCursor: null }),
      );
    globalThis.fetch = fetchMock;
    const request = createApiClient({
      baseUrl: `${BASE_URL}/`,
      getAccessToken: async () => 'access-token',
    });

    await expect(
      request('/api/v1/shares', {
        query: {
          cursorCreatedAt: '2026-10-11T01:02:03.123456Z',
          cursorId: '15',
        },
      }),
    ).resolves.toEqual({ sharedMedias: [], nextCursor: null });

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/api/v1/shares?cursorCreatedAt=2026-10-11T01%3A02%3A03.123456Z&cursorId=15`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer access-token',
        },
      },
    );
  });

  it('omits the authorization header without an access token and drops undefined query values', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(
        jsonResponse(200, { sharedMedias: [], nextCursor: null }),
      );
    globalThis.fetch = fetchMock;
    const request = createApiClient({
      baseUrl: BASE_URL,
      getAccessToken: async () => null,
    });

    await request('/api/v1/shares', {
      query: { cursorCreatedAt: undefined, cursorId: undefined },
    });

    expect(fetchMock).toHaveBeenCalledWith(`${BASE_URL}/api/v1/shares`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
  });

  it('serializes the JSON body and resolves undefined for a 204 response', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    globalThis.fetch = fetchMock;
    const request = createApiClient({
      baseUrl: BASE_URL,
      getAccessToken: async () => 'access-token',
    });

    await expect(
      request('/api/v1/auth/logouts', {
        method: 'POST',
        body: { refreshToken: 'refresh-token' },
      }),
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith(`${BASE_URL}/api/v1/auth/logouts`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: 'Bearer access-token',
      },
      body: JSON.stringify({ refreshToken: 'refresh-token' }),
    });
  });

  it('resolves undefined for a 202 response without a body', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(new Response('', { status: 202 }));
    const request = createApiClient({ baseUrl: BASE_URL });

    await expect(
      request('/api/v1/shares', {
        method: 'POST',
        body: { instagramUrl: 'https://www.instagram.com/reel/abc/' },
      }),
    ).resolves.toBeUndefined();
  });

  it('reports a 429 once with the request path and no query string', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(nginxResponse(429));
    const capture = jest.fn();
    const request = createApiClient({
      baseUrl: BASE_URL,
      onRateLimited: path => trackApiRateLimited({ capture }, path),
    });

    const error = await rejectionOf(
      request('/api/v1/saved-places', {
        method: 'DELETE',
        query: { savedPlaceIds: '1,2' },
      }),
    );

    expect(error).toMatchObject({ status: 429, errorCode: 'CLIENT429_001' });
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith('api_rate_limited', {
      path: '/api/v1/saved-places',
      platform: 'ios',
      release: '1.2.3',
      environment: 'development',
    });
  });
});

describe('api error mapping', () => {
  it.each([
    [401, 'AUTH401_001', '인증 토큰이 유효하지 않습니다.'],
    [
      401,
      'AUTH401_003',
      '이미 사용된 리프레시 토큰입니다. 다시 로그인해 주세요.',
    ],
    [401, 'AUTH401_004', '로그인이 필요한 요청입니다.'],
    [409, 'MEDIA409_001', '이미 신고한 공유입니다.'],
  ])(
    'keeps the server error %s %s with the X-Request-Id header',
    async (status, errorCode, message) => {
      globalThis.fetch = jest
        .fn()
        .mockResolvedValue(
          jsonResponse(
            status,
            { message, errorCode },
            { 'X-Request-Id': 'request-1' },
          ),
        );
      const request = createApiClient({ baseUrl: BASE_URL });

      const error = await rejectionOf(
        request('/api/v1/shares/15/reports', { method: 'POST' }),
      );

      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({
        status,
        errorCode,
        message,
        requestId: 'request-1',
      });
    },
  );

  it.each([
    [413, 'CLIENT413_001', '요청 내용이 너무 커요.'],
    [429, 'CLIENT429_001', '요청이 많아요. 잠시 후 다시 시도해주세요.'],
    [
      504,
      'CLIENT000_002',
      '응답이 늦어지고 있어요. 잠시 후 다시 시도해주세요.',
    ],
  ])(
    'classifies an nginx %s without a JSON body by its status',
    async (status, errorCode, message) => {
      globalThis.fetch = jest.fn().mockResolvedValue(nginxResponse(status));
      const request = createApiClient({ baseUrl: BASE_URL });

      const error = await rejectionOf(request('/api/v1/saved-places'));

      expect(error).toMatchObject({
        status,
        errorCode,
        message,
        requestId: null,
      });
    },
  );

  it('falls back to the status when the body is not the server error shape', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(
      jsonResponse(
        500,
        {
          timestamp: '2026-10-11T01:02:03.123Z',
          status: 500,
          error: 'Internal Server Error',
          path: '/api/v1/saved-places',
        },
        { 'X-Request-Id': 'request-2' },
      ),
    );
    const request = createApiClient({ baseUrl: BASE_URL });

    const error = await rejectionOf(request('/api/v1/saved-places'));

    expect(error).toMatchObject({
      status: 500,
      errorCode: 'DATA500_001',
      requestId: 'request-2',
    });
  });

  it('separates a network failure from a server response', async () => {
    globalThis.fetch = jest
      .fn()
      .mockRejectedValue(new TypeError('Network request failed'));
    const onRateLimited = jest.fn();
    const request = createApiClient({ baseUrl: BASE_URL, onRateLimited });

    const error = await rejectionOf(request('/api/v1/saved-places'));

    expect(error).toMatchObject({
      status: null,
      errorCode: 'CLIENT000_001',
      message: '인터넷 연결을 확인해주세요.',
      requestId: null,
    });
    expect(onRateLimited).not.toHaveBeenCalled();
  });

  it('treats a success response that is not JSON as an unprocessable response', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(
      new Response('<html>portal</html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      }),
    );
    const request = createApiClient({ baseUrl: BASE_URL });

    const error = await rejectionOf(request('/api/v1/saved-places'));

    expect(error).toMatchObject({
      status: 200,
      errorCode: 'CLIENT000_003',
      requestId: null,
    });
  });
});
