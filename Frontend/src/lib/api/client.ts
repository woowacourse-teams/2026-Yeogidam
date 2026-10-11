import { ApiError, createNetworkApiError, toApiError } from './errors';

export type ApiClientOptions = {
  /** 서버 주소입니다. 경로 `/api/v1` 앞까지 받습니다. */
  baseUrl: string;
  /** 요청마다 부르는 토큰 접근자입니다. 토큰이 있으면 Authorization: Bearer로 싣습니다. */
  getAccessToken?: () => Promise<string | null>;
  /**
   * 토큰을 실은 요청이 AUTH401_001을 받으면 거절된 토큰을 넘겨 한 번 부릅니다. true를 돌려주면
   * getAccessToken으로 토큰을 다시 받아 같은 요청을 한 번만 더 보냅니다.
   * 던지면 원래의 401 대신 던진 오류가 요청의 결과가 됩니다.
   */
  refreshSession?: (rejectedAccessToken: string) => Promise<boolean>;
  /**
   * 429를 받으면 요청의 path 인수로 한 번 부릅니다. nginx가 끝낸 429는 서버 로그에
   * 남지 않으므로 trackApiRateLimited를 넘겨 분석 이벤트로 남깁니다.
   */
  onRateLimited?: (path: string) => void;
};

export type ApiRequestOptions = {
  method?: 'GET' | 'POST' | 'DELETE';
  /** 값이 undefined인 키는 빼고 쿼리 문자열을 만듭니다. */
  query?: Record<string, string | number | undefined>;
  /** JSON으로 직렬화해 보냅니다. */
  body?: unknown;
};

/**
 * 경로는 `/api/v1/...`로 쓰고 쿼리는 query 옵션으로 넘깁니다. 본문이 없는 성공 응답(204, 빈 202)은
 * undefined로 끝납니다.
 */
export type ApiRequest = (
  path: string,
  options?: ApiRequestOptions,
) => Promise<unknown>;

function toQueryString(query: ApiRequestOptions['query']) {
  const params = new URLSearchParams();

  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value !== undefined) {
      params.append(key, String(value));
    }
  });

  const queryString = params.toString();

  return queryString ? `?${queryString}` : '';
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();

  return text ? JSON.parse(text) : undefined;
}

/**
 * 서버를 부르는 요청 함수를 만듭니다. 요청 전에 받은 토큰을 싣고, AUTH401_001이면
 * refreshSession 뒤 한 번만 다시 보냅니다. 실패는 모두 ApiError로 던집니다.
 */
export function createApiClient(options: ApiClientOptions): ApiRequest {
  const baseUrl = options.baseUrl.replace(/\/$/, '');

  const requestOnce = async (
    path: string,
    { method = 'GET', query, body }: ApiRequestOptions,
    token: string | null | undefined,
  ) => {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}${toQueryString(query)}`, {
        method,
        headers: {
          Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      throw createNetworkApiError();
    }

    const requestId = response.headers.get('X-Request-Id');

    if (response.status === 429) {
      options.onRateLimited?.(path);
    }

    if (!response.ok) {
      let errorBody: unknown = null;
      try {
        errorBody = await readJson(response);
      } catch {
        // 본문이 JSON이 아니면(nginx가 직접 끝낸 응답의 HTML 등) 상태 코드로 나눕니다.
      }
      throw toApiError(response.status, errorBody, requestId);
    }

    if (response.status === 204) {
      return undefined;
    }

    try {
      return await readJson(response);
    } catch {
      // 성공 응답인데 본문이 JSON이 아니면 상태 코드 분류의 기본값인 CLIENT000_003이 됩니다.
      throw toApiError(response.status, null, requestId);
    }
  };

  return async (path, requestOptions = {}) => {
    const token = await options.getAccessToken?.();

    try {
      return await requestOnce(path, requestOptions, token);
    } catch (error) {
      if (
        token &&
        error instanceof ApiError &&
        error.errorCode === 'AUTH401_001' &&
        (await options.refreshSession?.(token))
      ) {
        return requestOnce(
          path,
          requestOptions,
          await options.getAccessToken?.(),
        );
      }

      throw error;
    }
  };
}
