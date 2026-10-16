import {ApiError} from '../src/lib/api/errors';
import {
  PROCESSING_ERROR,
  SCREEN_ERROR_TABLE,
  TIMEOUT_ERROR,
  toScreenApiError,
  type ScreenErrorTable,
} from '../src/lib/api/screen-error';

const httpError = (status: number, errorCode: string | null, message: string) =>
  new ApiError({kind: 'http', status, errorCode, message});

describe('기본 표(SCREEN_ERROR_TABLE)', () => {
  test.each([
    [
      '401은 서버 코드와 관계없이 로그인 필요로 본다',
      httpError(401, 'AUTH401_004', '로그인이 필요한 요청입니다.'),
      {status: 401, errorCode: 'AUTH401_001', message: '로그인이 필요해요.', retryable: false},
    ],
    [
      '그 밖의 4xx는 서버 코드와 문구를 유지하고 다시 시도하지 않는다',
      httpError(404, 'PLACE404_001', '저장된 장소가 아닙니다.'),
      {status: 404, errorCode: 'PLACE404_001', message: '저장된 장소가 아닙니다.', retryable: false},
    ],
    [
      '429는 다시 시도할 수 있다',
      httpError(429, null, '요청을 처리하지 못했어요.'),
      {status: 429, errorCode: 'COMMON400_001', message: '요청을 처리하지 못했어요.', retryable: true},
    ],
    [
      '코드 없는 5xx는 COMMON500_001로 보고 다시 시도할 수 있다',
      httpError(502, null, '요청을 처리하지 못했어요.'),
      {status: 502, errorCode: 'COMMON500_001', message: '요청을 처리하지 못했어요.', retryable: true},
    ],
    [
      '코드 없는 4xx는 COMMON400_001로 본다',
      httpError(400, null, '요청을 처리하지 못했어요.'),
      {status: 400, errorCode: 'COMMON400_001', message: '요청을 처리하지 못했어요.', retryable: false},
    ],
    [
      '토큰이 없으면 로그인 필요로 본다',
      new ApiError({kind: 'auth', status: 401, message: '로그인이 필요해요.'}),
      {status: 401, errorCode: 'AUTH401_001', message: '로그인이 필요해요.', retryable: false},
    ],
    [
      '토큰을 읽지 못하면 상태 없이 로그인 필요로 보고 전송 계층 문구를 쓴다',
      new ApiError({kind: 'auth', message: '로그인 정보를 확인하지 못했어요.'}),
      {status: null, errorCode: 'AUTH401_001', message: '로그인 정보를 확인하지 못했어요.', retryable: false},
    ],
    [
      '시간 초과는 전송 계층 문구(토큰 재발급 대기 등)를 그대로 쓴다',
      new ApiError({kind: 'timeout', message: '로그인 정보를 확인하고 있어요. 잠시 후 다시 시도해주세요.'}),
      {
        status: null,
        errorCode: 'CLIENT000_002',
        message: '로그인 정보를 확인하고 있어요. 잠시 후 다시 시도해주세요.',
        retryable: true,
      },
    ],
    [
      '연결 실패는 CLIENT000_001로 다시 시도할 수 있다',
      new ApiError({kind: 'network', message: '인터넷 연결을 확인해주세요.'}),
      {status: null, errorCode: 'CLIENT000_001', message: '인터넷 연결을 확인해주세요.', retryable: true},
    ],
    [
      '취소는 CLIENT000_003으로 다시 시도할 수 있다',
      new ApiError({kind: 'cancelled', message: '요청이 취소됐어요.'}),
      {status: null, errorCode: 'CLIENT000_003', message: '요청이 취소됐어요.', retryable: true},
    ],
    [
      '요청을 만들지 못하면 처리 실패로 본다',
      new ApiError({kind: 'invalid_request', message: 'API 경로는 /로 시작해야 하며 쿼리와 해시를 포함할 수 없어요.'}),
      {...PROCESSING_ERROR},
    ],
    [
      '응답을 읽지 못하면 처리 실패로 보고 응답 상태를 남긴다',
      new ApiError({kind: 'invalid_response', status: 200, message: '응답을 처리하지 못했어요.'}),
      {...PROCESSING_ERROR, status: 200},
    ],
    [
      'ApiError가 아닌 오류는 처리 실패로 본다',
      new Error('secure storage unavailable'),
      {...PROCESSING_ERROR},
    ],
  ])('%s', (_rule, error, expected) => {
    expect(toScreenApiError(error)).toEqual(expected);
  });
});

test('기능 표는 바꾼 행만 쓰고 나머지 종류는 기본 표를 따른다', () => {
  const table: ScreenErrorTable = {
    ...SCREEN_ERROR_TABLE,
    timeout: () => ({...TIMEOUT_ERROR}),
  };

  expect(
    toScreenApiError(new ApiError({kind: 'timeout', message: '로그인 정보를 확인하고 있어요. 잠시 후 다시 시도해주세요.'}), table),
  ).toEqual(TIMEOUT_ERROR);
  expect(toScreenApiError(httpError(401, 'AUTH401_001', '인증 토큰이 유효하지 않습니다.'), table))
    .toMatchObject({errorCode: 'AUTH401_001', message: '로그인이 필요해요.'});
});
