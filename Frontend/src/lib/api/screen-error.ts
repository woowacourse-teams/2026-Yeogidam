import {ApiError} from './errors';

/** 화면이 errorCode와 retryable로 분기하는 오류 계약입니다. */
export type ScreenApiError = {
  status: number | null;
  errorCode: string;
  message: string;
  retryable: boolean;
};

export function isScreenApiError(value: unknown): value is ScreenApiError {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as ScreenApiError).errorCode === 'string' &&
    typeof (value as ScreenApiError).message === 'string' &&
    typeof (value as ScreenApiError).retryable === 'boolean'
  );
}

/**
 * Spring 요청 실패를 화면 오류 계약으로 바꿉니다.
 * 401은 모두 로그인 필요(AUTH401_001)로 보고, 그 밖의 HTTP 오류는 서버 errorCode를 유지합니다.
 */
export function toScreenApiError(error: unknown): ScreenApiError {
  if (isScreenApiError(error) && !(error instanceof ApiError)) return error;

  if (!(error instanceof ApiError)) {
    return {
      status: null,
      errorCode: 'CLIENT000_003',
      message: '응답을 처리하지 못했어요.',
      retryable: false,
    };
  }

  if (error.status === 401) {
    return {
      status: 401,
      errorCode: 'AUTH401_001',
      message: '로그인이 필요해요.',
      retryable: false,
    };
  }

  switch (error.kind) {
    case 'timeout':
      return {status: null, errorCode: 'CLIENT000_002', message: error.message, retryable: true};
    case 'network':
      return {status: null, errorCode: 'CLIENT000_001', message: error.message, retryable: true};
    case 'cancelled':
      return {status: null, errorCode: 'CLIENT000_003', message: error.message, retryable: true};
    case 'auth':
      return {status: error.status, errorCode: 'AUTH401_001', message: error.message, retryable: false};
    case 'http': {
      const status = error.status ?? 500;
      return {
        status,
        errorCode: error.errorCode ?? (status >= 500 ? 'COMMON500_001' : 'COMMON400_001'),
        message: error.message,
        retryable: status >= 500 || status === 429,
      };
    }
    default:
      return {
        status: error.status,
        errorCode: 'CLIENT000_003',
        message: '응답을 처리하지 못했어요.',
        retryable: false,
      };
  }
}
