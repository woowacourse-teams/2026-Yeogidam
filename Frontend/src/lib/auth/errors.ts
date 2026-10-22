import {ApiError} from '../api/errors';

export type AuthErrorCode =
  | 'AUTH000_001'
  | 'AUTH400_001'
  | 'AUTH502_001'
  | 'CLIENT000_001'
  | 'CLIENT000_002'
  | 'CLIENT000_003';

export type AuthErrorStage =
  | 'login_setup'
  | 'authorization_url'
  | 'provider_authorization'
  | 'callback'
  | 'backend_exchange'
  | 'session_persist';

export type AuthCancellationOrigin =
  | 'browser_cancel'
  | 'browser_dismiss'
  | 'oauth_access_denied';

export type NormalizedAuthError = {
  status: number | null;
  errorCode: AuthErrorCode;
  backendErrorCode?: string;
  message: string;
  retryable: boolean;
  requestId?: string;
  stage?: AuthErrorStage;
  cancelOrigin?: AuthCancellationOrigin;
};

type HttpLikeError = {
  message?: string;
  status?: number;
  code?: string;
  name?: string;
};

function getSafeBackendAuthErrorCode(value: string | null): string | undefined {
  return value && /^AUTH\d{3}_\d{3}$/.test(value) ? value : undefined;
}

export function isNormalizedAuthError(
  value: unknown,
): value is NormalizedAuthError {
  if (!value || typeof value !== 'object') {
    return false;
  }

  return 'errorCode' in value && 'message' in value && 'retryable' in value;
}

export function createCancelledAuthError(
  cancelOrigin?: AuthCancellationOrigin,
): NormalizedAuthError {
  return {
    status: null,
    errorCode: 'AUTH000_001',
    message: '로그인이 취소됐어요.',
    retryable: false,
    ...(cancelOrigin ? {cancelOrigin} : {}),
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

function createHttpAuthError(
  status: number,
  backendErrorCode: string | null,
  requestId: string | null,
): NormalizedAuthError {
  const safeBackendErrorCode = getSafeBackendAuthErrorCode(backendErrorCode);
  const backendDetails = {
    ...(safeBackendErrorCode ? {backendErrorCode: safeBackendErrorCode} : {}),
    ...(requestId ? {requestId} : {}),
  };

  if (status === 401) {
    // Keep the existing UI classification while preserving the server's precise code for diagnostics.
    return {...createHttpAuthError(400, null, requestId), status, ...backendDetails};
  }

  if (status === 400) {
    return {
      status,
      errorCode: 'AUTH400_001',
      message: '로그인을 완료하지 못했어요. 다시 시도해주세요.',
      retryable: true,
      ...backendDetails,
    };
  }

  if (status === 502 || status === 503) {
    return {
      status,
      errorCode: 'AUTH502_001',
      message: '로그인 제공자 연결이 원활하지 않아요.',
      retryable: true,
      ...backendDetails,
    };
  }

  return {
    ...createProcessingAuthError(),
    status,
    ...backendDetails,
  };
}

function normalizeApiAuthError(error: ApiError): NormalizedAuthError {
  if (error.kind === 'timeout') return createTimeoutAuthError();
  if (error.kind === 'network') return createNetworkAuthError();
  if (error.kind === 'http' && error.status != null) {
    return createHttpAuthError(error.status, error.errorCode, error.requestId);
  }
  if (error.kind === 'invalid_response') {
    return {
      ...createProcessingAuthError(),
      status: error.status,
      ...(error.requestId ? {requestId: error.requestId} : {}),
    };
  }
  return createProcessingAuthError();
}

export function withAuthErrorStage(
  error: unknown,
  stage: AuthErrorStage,
): NormalizedAuthError {
  const normalized = normalizeAuthError(error);
  return {...normalized, stage: normalized.stage ?? stage};
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
    return createHttpAuthError(httpError.status, null, null);
  }

  return createProcessingAuthError();
}
