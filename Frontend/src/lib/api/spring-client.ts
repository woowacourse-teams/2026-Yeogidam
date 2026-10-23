import {getSpringAccessToken, refreshSpringSession} from '../auth/spring-session';
import {createApiClient} from './client';
import type {ApiClient, ApiClientOptions, ApiRequestOptions} from './client';
import {ApiError} from './errors';

/** Spring Boot 보호 API에 앱 세션의 토큰을 붙이고 401은 한 번만 재시도합니다. */
export function createSpringApiClient(
  options: Omit<ApiClientOptions, 'getAccessToken'> = {},
): ApiClient {
  const client = createApiClient({...options, getAccessToken: getSpringAccessToken});

  return {
    async request<T>(path: string, requestOptions: ApiRequestOptions = {}): Promise<T> {
      try {
        return await client.request<T>(path, requestOptions);
      } catch (error) {
        if (
          requestOptions.auth === 'none' ||
          !(error instanceof ApiError) ||
          error.status !== 401 ||
          error.kind !== 'http'
        ) {
          throw error;
        }

        const refreshed = await refreshSpringSession();
        if (!refreshed) throw error;
        return client.request<T>(path, requestOptions);
      }
    },
  };
}
