import {createSpringApiClient} from '../src/lib/api/spring-client';
import {getSpringAccessToken, refreshSpringSession} from '../src/lib/auth/spring-session';

jest.mock('../src/lib/auth/spring-session', () => ({
  getSpringAccessToken: jest.fn(),
  refreshSpringSession: jest.fn(),
}));

const baseUrl = () => 'https://yeogidam-dev.duckdns.org';

beforeEach(() => {
  jest.mocked(getSpringAccessToken).mockReset();
  jest.mocked(refreshSpringSession).mockReset();
});

test('보호 API에 Spring 토큰을 붙이고 401이면 재발급 후 한 번 재시도한다', async () => {
  jest.mocked(getSpringAccessToken)
    .mockResolvedValueOnce('access-1')
    .mockResolvedValueOnce('access-2');
  jest.mocked(refreshSpringSession).mockResolvedValue({
    accessToken: 'access-2',
    refreshToken: 'refresh-2',
    tokenType: 'Bearer',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    refreshTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  });
  const fetchMock = jest.fn()
    .mockResolvedValueOnce({
      ok: false,
      status: 401,
      headers: {get: () => null},
      json: async () => ({errorCode: 'AUTH401_001', message: 'expired'}),
    })
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: {get: () => null},
      json: async () => ({id: 1}),
    });
  const client = createSpringApiClient({baseUrl, fetchImpl: fetchMock});

  await expect(client.request('/api/v1/members/me')).resolves.toEqual({id: 1});
  expect(refreshSpringSession).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer access-1');
  expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer access-2');
});
