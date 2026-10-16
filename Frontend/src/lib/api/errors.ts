export type ApiErrorKind =
  | 'auth'
  | 'http'
  | 'network'
  | 'timeout'
  | 'cancelled'
  | 'invalid_request'
  | 'invalid_response';

type ApiErrorOptions = {
  kind: ApiErrorKind;
  message: string;
  status?: number | null;
  errorCode?: string | null;
  requestId?: string | null;
  cause?: unknown;
};

/** Spring Boot 오류 응답과 요청 실패를 동일한 형태로 전달합니다. */
export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | null;
  readonly errorCode: string | null;
  readonly requestId: string | null;
  readonly cause?: unknown;

  constructor({
    kind,
    message,
    status = null,
    errorCode = null,
    requestId = null,
    cause,
  }: ApiErrorOptions) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
    this.errorCode = errorCode;
    this.requestId = requestId;
    this.cause = cause;
  }
}

export function httpApiError(
  status: number,
  body: unknown,
  requestId?: string | null,
): ApiError {
  const envelope = body && typeof body === 'object'
    ? body as {message?: unknown; errorCode?: unknown}
    : null;
  const message = typeof envelope?.message === 'string' && envelope.message.trim()
    ? envelope.message
    : '요청을 처리하지 못했어요.';
  const errorCode = typeof envelope?.errorCode === 'string' && envelope.errorCode.trim()
    ? envelope.errorCode
    : null;

  return new ApiError({kind: 'http', status, errorCode, message, requestId});
}
