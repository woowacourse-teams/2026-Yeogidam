export type ReelErrorCode =
  | 'COMMON400_001'
  | 'REEL400_001'
  | 'AUTH401_001'
  | 'COMMON500_001'
  | 'CLIENT000_001'
  | 'CLIENT000_002'
  | 'CLIENT000_003'
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

  if (error instanceof Error) {
    return new ReelApiError({
      errorCode: 'COMMON400_001',
      message: error.message,
      retryable: false,
    });
  }

  const networkCandidate = error as {message?: string} | null;

  return new ReelApiError({
    errorCode: 'CLIENT000_001',
    message: networkCandidate?.message ?? '인터넷 연결을 확인해주세요.',
    retryable: true,
  });
}
