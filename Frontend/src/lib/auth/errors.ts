import {ApiError} from '../api/errors';

/** 로그인 화면과 회원탈퇴 재인증이 보여 주는 오류입니다. retryable이면 로그인 화면이 다시 시도 안내를 덧붙입니다. */
export type NormalizedAuthError = {
  status: number | null;
  errorCode: string;
  message: string;
  retryable: boolean;
  requestId?: string | null;
};

const PROVIDER_UNAVAILABLE_MESSAGE = '로그인 제공자 연결이 원활하지 않아요.';

/** 로그인 흐름에서 서버 문구 대신 보여 줄 문구입니다. 나머지 코드는 서버 문구를 그대로 씁니다. */
const LOGIN_ERROR_MESSAGES: Partial<Record<string, string>> = {
  // 제공자가 인가 코드를 거부했습니다. 로그인을 처음부터 다시 하면 새 코드를 받습니다.
  AUTH401_002: '로그인을 완료하지 못했어요. 다시 시도해주세요.',
  AUTH502_001: PROVIDER_UNAVAILABLE_MESSAGE,
  AUTH502_002: PROVIDER_UNAVAILABLE_MESSAGE,
  AUTH503_001: PROVIDER_UNAVAILABLE_MESSAGE,
  AUTH503_002: PROVIDER_UNAVAILABLE_MESSAGE,
};

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

/**
 * 로그인 흐름의 오류를 화면이 보여 줄 오류로 바꿉니다. 서버 응답은 공통 HTTP 계층이 ApiError로 바꿔
 * 두었으므로 상태 코드, 서버 코드, 요청 ID를 그대로 옮기고 로그인 문구만 덧씌웁니다.
 */
export function normalizeAuthError(error: unknown): NormalizedAuthError {
  if (isNormalizedAuthError(error)) {
    return error;
  }

  if (error instanceof ApiError) {
    return {
      status: error.status,
      errorCode: error.errorCode,
      message: LOGIN_ERROR_MESSAGES[error.errorCode] ?? error.message,
      // 서버는 다시 시도해도 되는지 알려 주지 않으므로 네트워크 오류, 429, 5xx만 다시 시도할 오류로 봅니다.
      retryable:
        error.status === null || error.status === 429 || error.status >= 500,
      requestId: error.requestId,
    };
  }

  if (error instanceof Error && error.name === 'TimeoutError') {
    return createTimeoutAuthError();
  }

  return createProcessingAuthError();
}
