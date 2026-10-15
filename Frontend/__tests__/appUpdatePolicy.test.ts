import {createApiClient} from '../src/lib/api/client';
import {fetchAppUpdatePolicy} from '../src/lib/api/app-update-policy-api';

jest.mock('../src/lib/api/client', () => ({
  createApiClient: jest.fn(() => ({request: jest.fn()})),
}));

const {getAppUpdatePolicy} = jest.requireActual(
  '../src/lib/app-update-policy',
) as typeof import('../src/lib/app-update-policy');
const request = (createApiClient as jest.Mock).mock.results[0].value.request as jest.Mock;

beforeEach(() => {
  request.mockReset();
});

test('Spring Boot 공개 엔드포인트에 플랫폼과 앱 버전을 전달한다', async () => {
  const response = {
    updateRequired: false,
    updateRecommended: true,
    minimumSupportedVersion: '1.0.0',
    latestVersion: '1.2.0',
    storeUrl: 'https://example.com/store',
  };
  request.mockResolvedValue(response);

  await expect(fetchAppUpdatePolicy('ios', '1.1.0')).resolves.toBe(response);
  expect(request).toHaveBeenCalledWith('/api/v1/app-update-policies', {
    method: 'GET',
    auth: 'none',
    query: {platform: 'ios', appVersion: '1.1.0'},
    headers: {'Cache-Control': 'no-store'},
    timeoutMs: 5_000,
  });
});

test('정상 응답은 앱 진입 정책으로 반환한다', async () => {
  const policy = {
    updateRequired: true,
    updateRecommended: false,
    minimumSupportedVersion: '1.2.0',
    latestVersion: '1.2.0',
    storeUrl: 'https://example.com/store',
  };
  request.mockResolvedValue(policy);

  await expect(getAppUpdatePolicy()).resolves.toEqual(policy);
});

test('응답 형식이 맞지 않으면 앱 진입을 막지 않는다', async () => {
  request.mockResolvedValue({updateRequired: true, storeUrl: ''});

  await expect(getAppUpdatePolicy()).resolves.toBeNull();
});

test('권장 업데이트 응답도 반환한다', async () => {
  const policy = {
    updateRequired: false,
    updateRecommended: true,
    minimumSupportedVersion: '1.1.0',
    latestVersion: '1.2.0',
    storeUrl: 'https://example.com/store',
  };
  request.mockResolvedValue(policy);

  await expect(getAppUpdatePolicy()).resolves.toEqual(policy);
});

test('정책 서버가 실패해도 앱 진입을 막지 않는다', async () => {
  request.mockRejectedValue(new Error('network unavailable'));
  const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

  try {
    await expect(getAppUpdatePolicy()).resolves.toBeNull();
  } finally {
    warning.mockRestore();
  }
});
