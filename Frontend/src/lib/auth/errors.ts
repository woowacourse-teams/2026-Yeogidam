import {ApiError} from '../api/errors';

export type AuthErrorCode =
  | 'AUTH000_001'
  | 'AUTH400_001'
  | 'AUTH502_001'
  | 'CLIENT000_001'
  | 'CLIENT000_002'
  | 'CLIENT000_003';

export type NormalizedAuthError = {
  status: number | null;
  errorCode: AuthErrorCode;
  message: string;
  retryable: boolean;
  requestId?: string;
};

type HttpLikeError = {
  message?: string;
  status?: number;
  code?: string;
  name?: string;
};

function createRequestId() {
  const globalWithCrypto = globalThis as typeof globalThis & {
    crypto?: {randomUUID?: () => string};
  };
  const cryptoObject = globalWithCrypto.crypto;

  if (typeof cryptoObject?.randomUUID === 'function') {
    return cryptoObject.randomUUID();
  }

  return `req-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
}

export function isNormalizedAuthError(
  value: unknown,
): value is NormalizedAuthError {
  if (!value || typeof value !== 'object') {
    return false;
  }

  return 'errorCode' in value && 'message' in value && 'retryable' in value;
}

export function createCancelledAuthError(): NormalizedAuthError {
  return {
    status: null,
    errorCode: 'AUTH000_001',
    message: '로그인이 취소됐어요.',
    retryable: false,
  };
}

export function createProcessingAuthError(): NormalizedAuthError {
  return {
    status: null,
    errorCode: 'CLIENT000_003',
    message: '응답을 처리하지 못했어요.',
    retryable: false,
  };
}

export function createTimeoutAuthError(): NormalizedAuthError {
  return {
    status: null,
    errorCode: 'CLIENT000_002',
    message: '응답이 늦어지고 있어요. 잠시 후 다시 시도해주세요.',
    retryable: true,
  };
}

function createNetworkAuthError(): NormalizedAuthError {
  return {
    status: null,
    errorCode: 'CLIENT000_001',
    message: '인터넷 연결을 확인해주세요.',
    retryable: true,
  };
}

function createHttpAuthError(status: number): NormalizedAuthError {
  if (status === 401) {
    // Spring 로그인 API는 잘못된 소셜 인가 코드를 AUTH401_002로 돌려줍니다.
    return {...createHttpAuthError(400), status};
  }

  if (status === 400) {
    return {
      status,
      errorCode: 'AUTH400_001',
      message: '로그인을 완료하지 못했어요. 다시 시도해주세요.',
      retryable: true,
      requestId: createRequestId(),
    };
  }

  if (status === 502 || status === 503) {
    return {
      status,
      errorCode: 'AUTH502_001',
      message: '로그인 제공자 연결이 원활하지 않아요.',
      retryable: true,
      requestId: createRequestId(),
    };
  }

  return createProcessingAuthError();
}

function normalizeApiAuthError(error: ApiError): NormalizedAuthError {
  if (error.kind === 'timeout') return createTimeoutAuthError();
  if (error.kind === 'network') return createNetworkAuthError();
  if (error.kind === 'http' && error.status != null) {
    return createHttpAuthError(error.status);
  }
  return createProcessingAuthError();
}

export function normalizeAuthError(error: unknown): NormalizedAuthError {
  if (isNormalizedAuthError(error)) {
    return error;
  }

  if (error instanceof ApiError) {
    return normalizeApiAuthError(error);
  }

  if (error instanceof Error && error.name === 'TimeoutError') {
    return createTimeoutAuthError();
  }

  if (error instanceof TypeError) {
    return createNetworkAuthError();
  }

  const httpError = error as HttpLikeError | null;

  if (
    typeof httpError?.message === 'string' &&
    httpError.message.toLowerCase().includes('network')
  ) {
    return createNetworkAuthError();
  }

  if (typeof httpError?.status === 'number') {
    return createHttpAuthError(httpError.status);
  }

  return createProcessingAuthError();
}
