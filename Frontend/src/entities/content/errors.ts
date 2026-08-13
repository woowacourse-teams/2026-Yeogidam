export type ReelErrorCode =
  | 'COMMON400_001'
  | 'REEL400_001'
  | 'AUTH401_001'
  | 'AUTH401_002'
  | 'AUTH403_001'
  | 'COMMON405_001'
  | 'DATA500_001'
  | 'COMMON500_001'
  | 'CLIENT000_001'
  | 'CLIENT000_002'
  | 'CLIENT000_003';

export class ReelApiError extends Error {
  readonly errorCode: ReelErrorCode | null;
  readonly retryable: boolean;
  readonly requestId?: string;
  readonly field?: string;
  readonly status?: number | null;

  constructor(params: {
    errorCode?: ReelErrorCode | null;
    message: string;
    retryable?: boolean;
    requestId?: string;
    field?: string;
    status?: number | null;
  }) {
    super(params.message);
    this.name = 'ReelApiError';
    this.errorCode = params.errorCode ?? null;
    this.retryable = params.retryable ?? false;
    this.requestId = params.requestId;
    this.field = params.field;
    this.status = params.status;
  }
}

export function normalizeReelError(error: unknown): ReelApiError {
  if (error instanceof ReelApiError) {
    return error;
  }

  const candidate = error as {
    status?: number;
    message?: string;
  } | null;

  if (candidate?.status === 405) {
    return new ReelApiError({
      errorCode: 'COMMON405_001',
      message: '지원하지 않는 요청 방식이에요.',
      status: 405,
    });
  }

  if (candidate?.status === 408 || candidate?.status === 504) {
    return new ReelApiError({
      errorCode: 'CLIENT000_002',
      message: '응답이 늦어지고 있어요. 잠시 후 다시 시도해주세요.',
      retryable: true,
      status: candidate.status,
    });
  }

  if (error instanceof Error) {
    return new ReelApiError({
      errorCode: 'COMMON400_001',
      message: error.message,
      retryable: false,
    });
  }

  const networkCandidate = error as {
    context?: {json?: () => Promise<unknown>};
    message?: string;
  } | null;

  return new ReelApiError({
    errorCode: 'CLIENT000_001',
    message: networkCandidate?.message ?? '인터넷 연결을 확인해주세요.',
    retryable: true,
  });
}

export function reelErrorFromEnvelope(envelope: unknown): ReelApiError | null {
  if (!envelope || typeof envelope !== 'object') {
    return null;
  }

  const value = envelope as Record<string, unknown>;
  const errorCode = typeof value.errorCode === 'string' ? value.errorCode : null;
  const message = typeof value.message === 'string' ? value.message : null;

  if (!message) {
    return null;
  }

  return new ReelApiError({
    errorCode: errorCode as ReelErrorCode | null,
    message,
    retryable: value.retryable === true,
    requestId: typeof value.requestId === 'string' ? value.requestId : undefined,
    field:
      typeof value.details === 'object' && value.details !== null &&
      typeof (value.details as Record<string, unknown>).field === 'string'
        ? ((value.details as Record<string, unknown>).field as string)
        : undefined,
    status: typeof value.status === 'number' ? value.status : null,
  });
}

export function normalizeReelStatusError(error: unknown): ReelApiError {
  if (error instanceof ReelApiError) {
    return error;
  }

  const value = error as {status?: number; code?: string; message?: string} | null;
  const status = value?.status;

  if (status === 401) {
    return new ReelApiError({
      errorCode: 'AUTH401_002',
      message: '로그인이 만료됐어요. 다시 로그인해주세요.',
      retryable: true,
      status,
    });
  }

  if (status === 403) {
    return new ReelApiError({
      errorCode: 'AUTH403_001',
      message: '이 작업을 수행할 권한이 없어요.',
      retryable: false,
      status,
    });
  }

  if (status === 408 || status === 504) {
    return new ReelApiError({
      errorCode: 'CLIENT000_002',
      message: '응답이 늦어지고 있어요. 잠시 후 다시 시도해주세요.',
      retryable: true,
      status,
    });
  }

  if (value?.code === 'PGRST116') {
    return new ReelApiError({
      errorCode: 'CLIENT000_003',
      message: '응답을 처리하지 못했어요.',
      retryable: false,
    });
  }

  return new ReelApiError({
    errorCode: 'DATA500_001',
    message: '데이터를 처리하지 못했어요. 잠시 후 다시 시도해주세요.',
    retryable: true,
    status: status ?? null,
  });
}
