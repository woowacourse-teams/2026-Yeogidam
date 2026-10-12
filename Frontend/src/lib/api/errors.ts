/** 서버 실패 응답의 본문입니다. 서버는 두 필드만 내려 줍니다(Backend/docs/error-contract.md). */
type ServerErrorBody = {
  message: string;
  errorCode: string;
};

/**
 * 서버 호출이 실패했을 때 데이터 계층이 던지는 오류입니다. 서버 본문의 errorCode와 message는
 * 바꾸지 않고 싣고, 본문이 없는 응답과 네트워크 오류만 앱이 코드를 정합니다.
 */
export class ApiError extends Error {
  /** HTTP 상태 코드입니다. 응답을 받지 못한 네트워크 오류는 null입니다. */
  readonly status: number | null;
  readonly errorCode: string;
  /** 응답 헤더 X-Request-Id입니다. nginx가 직접 끝낸 응답과 네트워크 오류에는 없어 null입니다. */
  readonly requestId: string | null;

  constructor(params: {
    status: number | null;
    errorCode: string;
    message: string;
    requestId: string | null;
  }) {
    super(params.message);
    this.name = 'ApiError';
    this.status = params.status;
    this.errorCode = params.errorCode;
    this.requestId = params.requestId;
  }
}

function isServerErrorBody(value: unknown): value is ServerErrorBody {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const body = value as Partial<ServerErrorBody>;

  return typeof body.errorCode === 'string' && typeof body.message === 'string';
}

/**
 * 본문으로 서버 코드를 알 수 없을 때 상태 코드로 정하는 코드와 문구입니다. nginx가 직접 끝낸
 * 413, 429, 504에는 JSON 본문이 없습니다. 본문 없는 401, 403을 AUTH 코드로 바꾸면 서버의
 * 인증 판정으로 읽히므로 상태 코드만으로는 AUTH 코드를 만들지 않습니다.
 */
function fallbackForStatus(
  status: number,
): Pick<ApiError, 'errorCode' | 'message'> {
  if (status === 413) {
    return { errorCode: 'CLIENT413_001', message: '요청 내용이 너무 커요.' };
  }

  if (status === 429) {
    return {
      errorCode: 'CLIENT429_001',
      message: '요청이 많아요. 잠시 후 다시 시도해주세요.',
    };
  }

  if (status === 504) {
    return {
      errorCode: 'CLIENT000_002',
      message: '응답이 늦어지고 있어요. 잠시 후 다시 시도해주세요.',
    };
  }

  if (status >= 500) {
    return {
      errorCode: 'DATA500_001',
      message: '데이터를 처리하지 못했어요. 잠시 후 다시 시도해주세요.',
    };
  }

  return { errorCode: 'CLIENT000_003', message: '응답을 처리하지 못했어요.' };
}

/**
 * 응답을 ApiError로 바꿉니다. 본문이 서버 오류 모양이면 errorCode와 message를 그대로 쓰고,
 * 그렇지 않으면 상태 코드로 나눕니다.
 */
export function toApiError(
  status: number,
  body: unknown,
  requestId: string | null,
): ApiError {
  const { errorCode, message } = isServerErrorBody(body)
    ? body
    : fallbackForStatus(status);

  return new ApiError({ status, errorCode, message, requestId });
}

/** fetch가 응답을 받지 못하고 거절됐을 때의 오류입니다. */
export function createNetworkApiError(): ApiError {
  return new ApiError({
    status: null,
    errorCode: 'CLIENT000_001',
    message: '인터넷 연결을 확인해주세요.',
    requestId: null,
  });
}
