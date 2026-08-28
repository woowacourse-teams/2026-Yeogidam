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

type SupabaseLikeError = {
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
  if (status === 400) {
    return {
      status,
      errorCode: 'AUTH400_001',
      message: '로그인을 완료하지 못했어요. 다시 시도해주세요.',
      retryable: true,
      requestId: createRequestId(),
    };
  }

  if (status === 502) {
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

export function normalizeAuthError(error: unknown): NormalizedAuthError {
  if (isNormalizedAuthError(error)) {
    return error;
  }

  if (error instanceof Error && error.name === 'TimeoutError') {
    return createTimeoutAuthError();
  }

  if (error instanceof TypeError) {
    return createNetworkAuthError();
  }

  const supabaseError = error as SupabaseLikeError | null;

  if (
    typeof supabaseError?.message === 'string' &&
    supabaseError.message.toLowerCase().includes('network')
  ) {
    return createNetworkAuthError();
  }

  if (typeof supabaseError?.status === 'number') {
    return createHttpAuthError(supabaseError.status);
  }

  return createProcessingAuthError();
}
