import {
  NETWORK_ERROR,
  PROCESSING_ERROR,
  TIMEOUT_ERROR,
  toScreenApiError,
  type ClientErrorCode,
  type ScreenErrorTable,
} from '../api/screen-error';

/** 로그인 화면이 다루는 닫힌 오류 코드 목록입니다. 전송 실패 코드는 화면 공용 상수에서 가져옵니다. */
export type AuthErrorCode =
  | 'AUTH000_001'
  | 'AUTH400_001'
  | 'AUTH502_001'
  | ClientErrorCode;

export type AuthErrorStage =
  | 'login_setup'
  | 'authorization_url'
  | 'provider_authorization'
  | 'callback'
  | 'backend_exchange'
  | 'session_persist';

export type NormalizedAuthError = {
  status: number | null;
  errorCode: AuthErrorCode;
  backendErrorCode?: string;
  message: string;
  retryable: boolean;
  requestId?: string;
  stage?: AuthErrorStage;
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

export function createCancelledAuthError(): NormalizedAuthError {
  return {
    status: null,
    errorCode: 'AUTH000_001',
    message: '로그인이 취소됐어요.',
    retryable: false,
  };
}

export function createProcessingAuthError(): NormalizedAuthError {
  return {...PROCESSING_ERROR};
}

export function createTimeoutAuthError(): NormalizedAuthError {
  return {...TIMEOUT_ERROR};
}

function createNetworkAuthError(): NormalizedAuthError {
  return {...NETWORK_ERROR};
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

/**
 * 로그인 화면의 오류 표입니다. HTTP 오류는 상태로만 나누고 서버 코드는 진단용(backendErrorCode)으로
 * 남깁니다. 로그인 요청은 토큰 없이 보내므로 auth 행은 처리 실패로 둡니다.
 */
const LOGIN_ERROR_TABLE: ScreenErrorTable<NormalizedAuthError> = {
  http: error =>
    createHttpAuthError(error.status, error.errorCode, error.requestId),
  auth: createProcessingAuthError,
  timeout: createTimeoutAuthError,
  network: createNetworkAuthError,
  cancelled: createProcessingAuthError,
  invalid_request: createProcessingAuthError,
  invalid_response: error => ({
    ...createProcessingAuthError(),
    status: error.status,
    ...(error.requestId ? {requestId: error.requestId} : {}),
  }),
  unknown: normalizeUnknownAuthError,
};

export function withAuthErrorStage(
  error: unknown,
  stage: AuthErrorStage,
): NormalizedAuthError {
  const normalized = normalizeAuthError(error);
  return {...normalized, stage: normalized.stage ?? stage};
}

export function normalizeAuthError(error: unknown): NormalizedAuthError {
  return toScreenApiError(error, LOGIN_ERROR_TABLE);
}

/** ApiError가 아닌 값(이미 바꾼 로그인 오류, 제공자 SDK와 브라우저 오류)을 로그인 오류로 바꿉니다. */
function normalizeUnknownAuthError(error: unknown): NormalizedAuthError {
  if (isNormalizedAuthError(error)) {
    return error;
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
