import {createApiClient} from '../src/lib/api/client';
import {
  exchangeSpringAuthorizationCode,
  getSpringAuthorizationUrl,
  refreshSpringTokens,
  revokeSpringSession,
} from '../src/lib/api/spring-auth-api';

jest.mock('../src/lib/api/client', () => ({
  createApiClient: jest.fn(() => ({request: jest.fn()})),
}));

const request = (createApiClient as jest.Mock).mock.results[0].value.request as jest.Mock;

beforeEach(() => request.mockReset());

test('카카오와 구글 인가 주소는 공개 API에서 조회한다', async () => {
  request.mockResolvedValue({authorizationUrl: 'https://provider.example/authorize'});

  await expect(getSpringAuthorizationUrl('kakao')).resolves.toBe(
    'https://provider.example/authorize',
  );
  expect(request).toHaveBeenCalledWith('/oauth/kakao/authorize', {auth: 'none'});
});

test('인가 코드와 애플 이름을 Spring Boot 로그인 API에 전달한다', async () => {
  const response = {accessToken: 'access-token'};
  request.mockResolvedValue(response);

  await expect(
    exchangeSpringAuthorizationCode('apple', 'apple-code', '홍길동'),
  ).resolves.toBe(response);
  expect(request).toHaveBeenCalledWith('/api/v1/auth/logins/apple', {
    method: 'POST',
    auth: 'none',
    body: {authorizationCode: 'apple-code', fullName: '홍길동'},
  });

  await exchangeSpringAuthorizationCode('google', 'google-code');
  expect(request).toHaveBeenLastCalledWith('/api/v1/auth/logins/google', {
    method: 'POST',
    auth: 'none',
    body: {authorizationCode: 'google-code'},
  });
});

test('재발급과 로그아웃은 리프레시 토큰을 사용한다', async () => {
  request.mockResolvedValueOnce({accessToken: 'new-access'});
  request.mockResolvedValueOnce(undefined);

  await refreshSpringTokens('old-refresh');
  expect(request).toHaveBeenNthCalledWith(1, '/api/v1/auth/token-refreshes', {
    method: 'POST',
    auth: 'none',
    body: {refreshToken: 'old-refresh'},
  });

  await revokeSpringSession('new-refresh');
  expect(request).toHaveBeenNthCalledWith(2, '/api/v1/auth/logouts', {
    method: 'POST',
    auth: 'none',
    body: {refreshToken: 'new-refresh'},
  });
});
