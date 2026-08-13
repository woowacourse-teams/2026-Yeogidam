export type ReelErrorCode =
  | 'COMMON400_001'
  | 'REEL400_001'
  | 'AUTH401_001'
  | 'AUTH401_002'
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

  constructor(params: {
    errorCode?: ReelErrorCode | null;
    message: string;
    retryable?: boolean;
    requestId?: string;
    field?: string;
  }) {
    super(params.message);
    this.name = 'ReelApiError';
    this.errorCode = params.errorCode ?? null;
    this.retryable = params.retryable ?? false;
    this.requestId = params.requestId;
    this.field = params.field;
  }
}

export function normalizeReelError(error: unknown): ReelApiError {
  if (error instanceof ReelApiError) {
    return error;
  }

  const candidate = error as {
    context?: {json?: () => Promise<unknown>};
    message?: string;
  } | null;

  return new ReelApiError({
    errorCode: 'CLIENT000_001',
    message: candidate?.message ?? '인터넷 연결을 확인해주세요.',
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
  });
}
