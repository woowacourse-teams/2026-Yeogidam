import {ApiError, type ApiErrorKind} from './errors';

/** 화면이 errorCode와 retryable로 분기하는 오류 계약입니다. 기능별 오류 타입은 이 모양을 그대로 쓰거나 넓혀 씁니다. */
export type ScreenApiError = {
  status: number | null;
  errorCode: string;
  message: string;
  retryable: boolean;
  requestId?: string;
};

/** 여러 기능이 같은 코드와 문구로 보여 주는 클라이언트 오류입니다. 돌려줄 때는 펼쳐서 새 객체로 만듭니다. */
export const NETWORK_ERROR = {
  status: null,
  errorCode: 'CLIENT000_001',
  message: '인터넷 연결을 확인해주세요.',
  retryable: true,
} as const;

export const TIMEOUT_ERROR = {
  status: null,
  errorCode: 'CLIENT000_002',
  message: '응답이 늦어지고 있어요. 잠시 후 다시 시도해주세요.',
  retryable: true,
} as const;

export const PROCESSING_ERROR = {
  status: null,
  errorCode: 'CLIENT000_003',
  message: '응답을 처리하지 못했어요.',
  retryable: false,
} as const;

export const LOGIN_REQUIRED_ERROR = {
  status: 401,
  errorCode: 'AUTH401_001',
  message: '로그인이 필요해요.',
  retryable: false,
} as const;

/** httpApiError가 만든 오류입니다. HTTP 응답을 받았으므로 상태가 늘 있습니다. */
export type HttpApiError = ApiError & {status: number};

/**
 * 기능이 ApiError 종류(kind)마다 화면에 줄 오류를 정한 표입니다.
 * ApiError가 아닌 값(설정 누락, Keychain 실패 등)은 unknown 행이 맡습니다.
 */
export type ScreenErrorTable<V extends ScreenApiError = ScreenApiError> = {
  [Kind in Exclude<ApiErrorKind, 'http'>]: (error: ApiError) => V;
} & {
  http: (error: HttpApiError) => V;
  unknown: (error: unknown) => V;
};

/**
 * 기능이 따로 정하지 않으면 쓰는 표입니다. 401은 모두 로그인 필요(AUTH401_001)로 보고,
 * 그 밖의 HTTP 오류는 서버 errorCode와 문구를 유지하며, 전송 계층이 정한 문구는 그대로 보여 줍니다.
 */
export const SCREEN_ERROR_TABLE: ScreenErrorTable = {
  http: error =>
    error.status === 401
      ? {...LOGIN_REQUIRED_ERROR}
      : {
          status: error.status,
          errorCode:
            error.errorCode ??
            (error.status >= 500 ? 'COMMON500_001' : 'COMMON400_001'),
          message: error.message,
          retryable: error.status >= 500 || error.status === 429,
        },
  // 토큰이 없으면 401과 '로그인이 필요해요.'가, 토큰을 읽지 못하면 상태 없이 그 사유가 담겨 옵니다.
  auth: error => ({
    status: error.status,
    errorCode: 'AUTH401_001',
    message: error.message,
    retryable: false,
  }),
  timeout: error => ({...TIMEOUT_ERROR, message: error.message}),
  network: error => ({...NETWORK_ERROR, message: error.message}),
  cancelled: error => ({
    ...PROCESSING_ERROR,
    message: error.message,
    retryable: true,
  }),
  invalid_request: error => ({...PROCESSING_ERROR, status: error.status}),
  invalid_response: error => ({...PROCESSING_ERROR, status: error.status}),
  unknown: () => ({...PROCESSING_ERROR}),
};

/** 요청 실패를 화면 오류 계약으로 바꿉니다. 표를 넘기지 않으면 SCREEN_ERROR_TABLE을 씁니다. */
export function toScreenApiError(error: unknown): ScreenApiError;
export function toScreenApiError<V extends ScreenApiError>(
  error: unknown,
  table: ScreenErrorTable<V>,
): V;
export function toScreenApiError(
  error: unknown,
  table: ScreenErrorTable = SCREEN_ERROR_TABLE,
): ScreenApiError {
  if (!(error instanceof ApiError)) return table.unknown(error);
  // kind가 http인 오류는 httpApiError만 만들고, 늘 응답 상태를 담습니다.
  if (error.kind === 'http') return table.http(error as HttpApiError);
  return table[error.kind](error);
}
