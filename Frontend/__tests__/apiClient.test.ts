import {createApiClient} from '../src/lib/api/client';
import {ApiError} from '../src/lib/api/errors';
import {toScreenApiError} from '../src/lib/api/screen-error';
import {toReelApiError} from '../src/entities/content/api';

jest.mock('../src/lib/api/spring-client', () => ({
  createSpringApiClient: jest.fn(() => ({request: jest.fn()})),
}));

const baseUrl = () => 'https://yeogidam-dev.duckdns.org';

test('공개 API는 토큰 없이 요청하고 쿼리 값을 인코딩한다', async () => {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: {get: () => null},
    json: async () => ({updateRequired: false}),
  });
  const client = createApiClient({baseUrl, fetchImpl: fetchMock});

  await expect(client.request('/api/v1/app-update-policies', {
    auth: 'none',
    query: {platform: 'ios', appVersion: '1.1.0'},
  })).resolves.toEqual({updateRequired: false});
  expect(fetchMock).toHaveBeenCalledWith(
    'https://yeogidam-dev.duckdns.org/api/v1/app-update-policies?platform=ios&appVersion=1.1.0',
    expect.objectContaining({
      method: 'GET',
      headers: {Accept: 'application/json'},
    }),
  );
});

test('인증 API는 Bearer 토큰과 JSON 본문을 전송한다', async () => {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: true,
    status: 204,
    headers: {get: () => null},
  });
  const client = createApiClient({
    baseUrl,
    fetchImpl: fetchMock,
    getAccessToken: async () => 'spring-access-token',
  });

  await expect(client.request<void>('/api/v1/shares/12/reports', {
    method: 'POST',
    body: {reason: 'duplicate'},
  })).resolves.toBeUndefined();
  expect(fetchMock).toHaveBeenCalledWith(
    'https://yeogidam-dev.duckdns.org/api/v1/shares/12/reports',
    expect.objectContaining({
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: 'Bearer spring-access-token',
      },
      body: '{"reason":"duplicate"}',
    }),
  );
});

test('토큰이 없으면 보호된 API를 호출하지 않는다', async () => {
  const fetchMock = jest.fn();
  const client = createApiClient({baseUrl, fetchImpl: fetchMock});

  await expect(client.request('/api/v1/members/me'))
    .rejects.toMatchObject({kind: 'auth', status: 401});
  expect(fetchMock).not.toHaveBeenCalled();
});

test('서버의 오류 코드와 메시지를 보존한다', async () => {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: false,
    status: 401,
    headers: {get: () => null},
    json: async () => ({message: '토큰이 만료됐습니다.', errorCode: 'AUTH401_001'}),
  });
  const client = createApiClient({baseUrl, fetchImpl: fetchMock});

  await expect(client.request('/api/v1/auth/logins/google', {auth: 'none'}))
    .rejects.toMatchObject({
      kind: 'http',
      status: 401,
      errorCode: 'AUTH401_001',
      message: '토큰이 만료됐습니다.',
    });
});

test('응답 본문이 없는 서버 오류도 HTTP 상태를 전달한다', async () => {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: false,
    status: 502,
    headers: {get: () => null},
    json: async () => { throw new SyntaxError('invalid JSON'); },
  });
  const client = createApiClient({baseUrl, fetchImpl: fetchMock});

  await expect(client.request('/api/v1/auth/logins/google', {auth: 'none'}))
    .rejects.toMatchObject({kind: 'http', status: 502, errorCode: null});
});

test('성공 응답이 JSON이 아니면 잘못된 응답으로 구분한다', async () => {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: {get: () => null},
    json: async () => { throw new SyntaxError('invalid JSON'); },
  });
  const client = createApiClient({baseUrl, fetchImpl: fetchMock});

  await expect(client.request('/api/v1/app-update-policies', {auth: 'none'}))
    .rejects.toMatchObject({kind: 'invalid_response', status: 200});
});

test('연결 실패는 네트워크 오류로 구분한다', async () => {
  const fetchMock = jest.fn().mockRejectedValue(new TypeError('Network request failed'));
  const client = createApiClient({baseUrl, fetchImpl: fetchMock});

  await expect(client.request('/api/v1/app-update-policies', {auth: 'none'}))
    .rejects.toMatchObject({kind: 'network', status: null});
});

test('JSON으로 변환할 수 없는 본문은 네트워크 오류로 분류하지 않는다', async () => {
  const fetchMock = jest.fn();
  const body: {self?: unknown} = {};
  body.self = body;
  const client = createApiClient({baseUrl, fetchImpl: fetchMock});

  await expect(client.request('/api/v1/auth/logins/google', {
    auth: 'none',
    method: 'POST',
    body,
  })).rejects.toMatchObject({kind: 'invalid_request', cause: expect.any(TypeError)});
  expect(fetchMock).not.toHaveBeenCalled();
});

test('토큰 제공 함수의 실패는 원인을 보존한 인증 오류로 전달한다', async () => {
  const fetchMock = jest.fn();
  const cause = new Error('secure storage unavailable');
  const client = createApiClient({
    baseUrl,
    fetchImpl: fetchMock,
    getAccessToken: async () => { throw cause; },
  });

  await expect(client.request('/api/v1/members/me'))
    .rejects.toMatchObject({kind: 'auth', cause});
  expect(fetchMock).not.toHaveBeenCalled();
});

test.each(['network', 'timeout'] as const)(
  '토큰 재발급이 %s 오류로 실패하면 로그인 필요가 아닌 연결 오류로 전달한다',
  async kind => {
    const fetchMock = jest.fn();
    const cause = new ApiError({kind, message: '인터넷 연결을 확인해주세요.'});
    const client = createApiClient({
      baseUrl,
      fetchImpl: fetchMock,
      getAccessToken: async () => { throw cause; },
    });

    const error = await client.request('/api/v1/saved-places').catch(e => e);
    expect(error).toBe(cause);
    expect(fetchMock).not.toHaveBeenCalled();

    const code = kind === 'network' ? 'CLIENT000_001' : 'CLIENT000_002';
    expect(toScreenApiError(error)).toMatchObject({errorCode: code, retryable: true});
    expect(toReelApiError(error)).toMatchObject({errorCode: code, retryable: true});
  },
);

test('토큰을 기다리는 동안 취소되면 요청을 전송하지 않는다', async () => {
  const fetchMock = jest.fn();
  const controller = new AbortController();
  const client = createApiClient({
    baseUrl,
    fetchImpl: fetchMock,
    getAccessToken: async () => {
      controller.abort();
      return 'spring-access-token';
    },
  });

  await expect(client.request('/api/v1/members/me', {signal: controller.signal}))
    .rejects.toMatchObject({kind: 'cancelled'});
  expect(fetchMock).not.toHaveBeenCalled();
});

test('응답 제한 시간을 넘기면 timeout 오류를 전달한다', async () => {
  jest.useFakeTimers();
  try {
    const fetchMock = jest.fn((_url: unknown, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      }),
    );
    const client = createApiClient({baseUrl, fetchImpl: fetchMock as typeof fetch});
    const request = client.request('/api/v1/app-update-policies', {
      auth: 'none',
      timeoutMs: 50,
    });

    const outcome = request.catch(error => error);
    await jest.advanceTimersByTimeAsync(50);
    await expect(outcome).resolves.toMatchObject({kind: 'timeout', status: null});
  } finally {
    jest.useRealTimers();
  }
});

test('본문이 빈 2xx 응답(201 Created 등)은 undefined로 처리한다', async () => {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: true,
    status: 201,
    text: async () => '',
    json: async () => { throw new SyntaxError('Unexpected end of JSON input'); },
  });
  const client = createApiClient({
    baseUrl,
    fetchImpl: fetchMock,
    getAccessToken: async () => 'spring-access-token',
  });

  await expect(client.request('/api/v1/shares/7/reports', {method: 'POST'}))
    .resolves.toBeUndefined();
});

test('text()로 읽은 오류 본문의 서버 오류 코드를 유지한다', async () => {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: false,
    status: 409,
    text: async () => JSON.stringify({message: '이미 신고한 공유입니다.', errorCode: 'MEDIA409_001'}),
  });
  const client = createApiClient({
    baseUrl,
    fetchImpl: fetchMock,
    getAccessToken: async () => 'spring-access-token',
  });

  await expect(client.request('/api/v1/shares/7/reports', {method: 'POST'}))
    .rejects.toMatchObject({kind: 'http', status: 409, errorCode: 'MEDIA409_001'});
});
