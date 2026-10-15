import {getApiBaseUrl} from './config';
import {ApiError, httpApiError} from './errors';

type QueryValue = string | number | boolean;
type Query = Record<string, QueryValue | readonly QueryValue[] | null | undefined>;
type AccessTokenProvider = () => Promise<string | null>;

export type ApiRequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  query?: Query;
  body?: unknown;
  headers?: Record<string, string>;
  /** 기본값은 required입니다. 공개 API에서만 none을 지정합니다. */
  auth?: 'required' | 'none';
  /** 토큰 조회가 끝난 뒤 HTTP 요청과 응답 본문에 적용됩니다. */
  timeoutMs?: number;
  signal?: AbortSignal;
};

export type ApiClientOptions = {
  baseUrl?: () => string;
  getAccessToken?: AccessTokenProvider;
  fetchImpl?: typeof fetch;
  defaultTimeoutMs?: number;
};

export type ApiClient = {
  request<T>(path: string, options?: ApiRequestOptions): Promise<T>;
};

function buildUrl(baseUrl: string, path: string, query?: Query): string {
  if (!path.startsWith('/') || path.startsWith('//') || /[?#]/.test(path)) {
    throw new ApiError({
      kind: 'invalid_request',
      message: 'API 경로는 /로 시작해야 하며 쿼리와 해시를 포함할 수 없어요.',
    });
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value == null) continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      params.append(key, String(item));
    }
  }

  const search = params.toString();
  return `${baseUrl.replace(/\/+$/, '')}${path}${search ? `?${search}` : ''}`;
}

async function buildHeaders(
  {auth = 'required', body, headers: extraHeaders}: ApiRequestOptions,
  getAccessToken?: AccessTokenProvider,
): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(body !== undefined ? {'Content-Type': 'application/json'} : {}),
    ...extraHeaders,
  };

  if (auth === 'none') return headers;

  let token: string | null | undefined;
  try {
    token = await getAccessToken?.();
  } catch (cause) {
    // 토큰 재발급 중 연결 실패는 로그인 만료가 아니므로 원래 종류를 유지해 재시도할 수 있게 합니다.
    if (
      cause instanceof ApiError &&
      (cause.kind === 'network' || cause.kind === 'timeout' || cause.kind === 'cancelled')
    ) {
      throw cause;
    }
    throw new ApiError({
      kind: 'auth',
      message: '로그인 정보를 확인하지 못했어요.',
      cause,
    });
  }

  if (!token) {
    throw new ApiError({kind: 'auth', status: 401, message: '로그인이 필요해요.'});
  }

  headers.Authorization = `Bearer ${token}`;
  return headers;
}

function serializeBody(body: unknown): string | undefined {
  if (body === undefined) return undefined;

  try {
    const json = JSON.stringify(body);
    if (json !== undefined) return json;
  } catch (cause) {
    throw new ApiError({
      kind: 'invalid_request',
      message: '요청 본문을 JSON으로 변환하지 못했어요.',
      cause,
    });
  }

  throw new ApiError({
    kind: 'invalid_request',
    message: '요청 본문을 JSON으로 변환하지 못했어요.',
  });
}

function createCancellation(callerSignal: AbortSignal | undefined, timeoutMs: number) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new ApiError({
      kind: 'invalid_request',
      message: '요청 제한 시간은 0보다 커야 해요.',
    });
  }

  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort();

  if (callerSignal?.aborted) {
    controller.abort();
  } else {
    callerSignal?.addEventListener('abort', abortFromCaller);
  }

  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  return {
    signal: controller.signal,
    didTimeOut: () => timedOut,
    dispose: () => {
      clearTimeout(timeoutId);
      callerSignal?.removeEventListener('abort', abortFromCaller);
    },
  };
}

async function readResponse<T>(response: Response, signal: AbortSignal): Promise<T> {
  if (response.status === 204 || response.status === 205) {
    return undefined as T;
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (cause) {
    if (signal.aborted) throw cause;
    if (response.ok) {
      throw new ApiError({
        kind: 'invalid_response',
        status: response.status,
        message: '응답을 처리하지 못했어요.',
        cause,
      });
    }
  }

  if (!response.ok) throw httpApiError(response.status, payload);
  return payload as T;
}

function requestError(
  cause: unknown,
  timedOut: boolean,
  callerSignal?: AbortSignal,
): ApiError {
  if (cause instanceof ApiError) return cause;
  if (timedOut) {
    return new ApiError({
      kind: 'timeout',
      message: '응답이 늦어지고 있어요. 잠시 후 다시 시도해주세요.',
      cause,
    });
  }
  if (callerSignal?.aborted) {
    return new ApiError({kind: 'cancelled', message: '요청이 취소됐어요.', cause});
  }
  return new ApiError({kind: 'network', message: '인터넷 연결을 확인해주세요.', cause});
}

function throwIfCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new ApiError({kind: 'cancelled', message: '요청이 취소됐어요.'});
  }
}

/** 인증 토큰 제공자는 Spring Boot 인증 연동 시 주입합니다. */
export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  const baseUrl = options.baseUrl ?? getApiBaseUrl;
  const fetchImpl = options.fetchImpl ?? fetch;
  const defaultTimeoutMs = options.defaultTimeoutMs ?? 10_000;

  return {
    async request<T>(path: string, requestOptions: ApiRequestOptions = {}): Promise<T> {
      throwIfCancelled(requestOptions.signal);

      const url = buildUrl(baseUrl(), path, requestOptions.query);
      const headers = await buildHeaders(requestOptions, options.getAccessToken);
      throwIfCancelled(requestOptions.signal);
      const body = serializeBody(requestOptions.body);
      const cancellation = createCancellation(
        requestOptions.signal,
        requestOptions.timeoutMs ?? defaultTimeoutMs,
      );

      try {
        const response = await fetchImpl(url, {
          method: requestOptions.method ?? 'GET',
          headers,
          ...(body !== undefined ? {body} : {}),
          signal: cancellation.signal,
        });
        return await readResponse<T>(response, cancellation.signal);
      } catch (cause) {
        throw requestError(cause, cancellation.didTimeOut(), requestOptions.signal);
      } finally {
        cancellation.dispose();
      }
    },
  };
}
