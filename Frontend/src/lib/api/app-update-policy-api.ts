import {createApiClient} from './client';

const REQUEST_TIMEOUT_MS = 5_000;
const apiClient = createApiClient();

/** 앱 업데이트 정책은 로그인 전에도 확인하므로 인증 없이 요청합니다. */
export function fetchAppUpdatePolicy(
  platform: 'ios' | 'android',
  appVersion: string,
): Promise<unknown> {
  return apiClient.request<unknown>('/api/v1/app-update-policies', {
    method: 'GET',
    auth: 'none',
    query: {platform, appVersion},
    headers: {'Cache-Control': 'no-store'},
    timeoutMs: REQUEST_TIMEOUT_MS,
  });
}
