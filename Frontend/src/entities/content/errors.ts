import {
  INVALID_REQUEST_ERROR,
  NETWORK_ERROR,
  type KnownScreenErrorCode,
} from '../../lib/api/screen-error';

/** 화면 공용 오류 코드에 릴스 저장과 미디어 처리 코드를 더한 목록입니다. */
export type ReelErrorCode =
  | KnownScreenErrorCode
  | 'REEL400_001'
  | 'MEDIA400_001'
  | 'MEDIA400_010'
  | 'MEDIA400_011'
  // Spring 서버가 새 오류 코드를 추가해도 그대로 전달합니다.
  | (string & {});

export class ReelApiError extends Error {
  readonly errorCode: ReelErrorCode | null;
  readonly retryable: boolean;
  readonly field?: string;
  readonly status?: number | null;

  constructor(params: {
    errorCode?: ReelErrorCode | null;
    message: string;
    retryable?: boolean;
    field?: string;
    status?: number | null;
  }) {
    super(params.message);
    this.name = 'ReelApiError';
    this.errorCode = params.errorCode ?? null;
    this.retryable = params.retryable ?? false;
    this.field = params.field;
    this.status = params.status;
  }
}

/**
 * 화면이 받은 오류를 ReelApiError로 맞춥니다. API 오류는 toReelApiError를 거쳐 이미 ReelApiError로 오므로
 * 나머지는 응답을 읽다 난 JS 오류(TypeError 등)와 Error가 아닌 값입니다.
 */
export function normalizeReelError(error: unknown): ReelApiError {
  if (error instanceof ReelApiError) {
    return error;
  }

  // 응답을 받기 전이나 읽다 난 오류라 상수의 status는 옮기지 않습니다. 옮기면 재시도 지표의 응답 상태에 받지 않은 값이 실립니다.
  if (error instanceof Error) {
    return new ReelApiError({
      errorCode: INVALID_REQUEST_ERROR.errorCode,
      message: error.message,
      retryable: INVALID_REQUEST_ERROR.retryable,
    });
  }

  const networkCandidate = error as {message?: string} | null;

  return new ReelApiError({
    errorCode: NETWORK_ERROR.errorCode,
    message: networkCandidate?.message ?? NETWORK_ERROR.message,
    retryable: NETWORK_ERROR.retryable,
  });
}
