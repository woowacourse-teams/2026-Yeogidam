import {ApiError} from '../src/lib/api/errors';
import {
  createCancelledAuthError,
  normalizeAuthError,
  withAuthErrorStage,
} from '../src/lib/auth/errors';

const PROCESSING = {
  status: null,
  errorCode: 'CLIENT000_003',
  message: '응답을 처리하지 못했어요.',
  retryable: false,
};

const httpError = (status: number, errorCode: string | null, requestId: string | null = null) =>
  new ApiError({kind: 'http', status, errorCode, message: '서버 문구', requestId});

const timeoutError = () => {
  const error = new Error('OAuth callback timed out.');
  error.name = 'TimeoutError';
  return error;
};

describe('로그인 오류 표(normalizeAuthError)', () => {
  test.each([
    [
      '400은 로그인 미완료로 보고 다시 시도할 수 있다',
      httpError(400, 'COMMON400_001'),
      {status: 400, errorCode: 'AUTH400_001', message: '로그인을 완료하지 못했어요. 다시 시도해주세요.', retryable: true},
    ],
    [
      '401도 로그인 미완료로 보고 서버의 AUTH 코드를 진단용으로 남긴다',
      httpError(401, 'AUTH401_002', 'req-1'),
      {
        status: 401,
        errorCode: 'AUTH400_001',
        message: '로그인을 완료하지 못했어요. 다시 시도해주세요.',
        retryable: true,
        backendErrorCode: 'AUTH401_002',
        requestId: 'req-1',
      },
    ],
    [
      '502는 제공자 연결 오류로 본다',
      httpError(502, 'AUTH502_001'),
      {
        status: 502,
        errorCode: 'AUTH502_001',
        message: '로그인 제공자 연결이 원활하지 않아요.',
        retryable: true,
        backendErrorCode: 'AUTH502_001',
      },
    ],
    [
      '503도 제공자 연결 오류로 본다',
      httpError(503, 'AUTH503_001'),
      {
        status: 503,
        errorCode: 'AUTH502_001',
        message: '로그인 제공자 연결이 원활하지 않아요.',
        retryable: true,
        backendErrorCode: 'AUTH503_001',
      },
    ],
    [
      '그 밖의 상태는 처리 실패로 보고 AUTH가 아닌 서버 코드는 남기지 않는다',
      httpError(500, 'COMMON500_001'),
      {...PROCESSING, status: 500},
    ],
    [
      '시간 초과',
      new ApiError({kind: 'timeout', message: '응답이 늦어지고 있어요. 잠시 후 다시 시도해주세요.'}),
      {status: null, errorCode: 'CLIENT000_002', message: '응답이 늦어지고 있어요. 잠시 후 다시 시도해주세요.', retryable: true},
    ],
    [
      '연결 실패',
      new ApiError({kind: 'network', message: '인터넷 연결을 확인해주세요.'}),
      {status: null, errorCode: 'CLIENT000_001', message: '인터넷 연결을 확인해주세요.', retryable: true},
    ],
    [
      '응답을 읽지 못하면 상태와 요청 ID를 남긴다',
      new ApiError({kind: 'invalid_response', status: 200, message: '응답을 처리하지 못했어요.', requestId: 'req-2'}),
      {...PROCESSING, status: 200, requestId: 'req-2'},
    ],
    [
      '토큰 오류는 처리 실패로 본다',
      new ApiError({kind: 'auth', status: 401, message: '로그인이 필요해요.'}),
      PROCESSING,
    ],
    [
      '취소는 처리 실패로 본다',
      new ApiError({kind: 'cancelled', message: '요청이 취소됐어요.'}),
      PROCESSING,
    ],
    [
      '요청을 만들지 못하면 처리 실패로 본다',
      new ApiError({kind: 'invalid_request', message: '요청 본문을 JSON으로 변환하지 못했어요.'}),
      PROCESSING,
    ],
    [
      'TimeoutError 이름의 오류는 시간 초과로 본다',
      timeoutError(),
      {status: null, errorCode: 'CLIENT000_002', message: '응답이 늦어지고 있어요. 잠시 후 다시 시도해주세요.', retryable: true},
    ],
    [
      'TypeError는 연결 실패로 본다',
      new TypeError('Network request failed'),
      {status: null, errorCode: 'CLIENT000_001', message: '인터넷 연결을 확인해주세요.', retryable: true},
    ],
    [
      '문구에 network가 있으면 연결 실패로 본다',
      new Error('The Network connection was lost.'),
      {status: null, errorCode: 'CLIENT000_001', message: '인터넷 연결을 확인해주세요.', retryable: true},
    ],
    [
      'HTTP 상태를 가진 값은 상태로 나눈다',
      {status: 400},
      {status: 400, errorCode: 'AUTH400_001', message: '로그인을 완료하지 못했어요. 다시 시도해주세요.', retryable: true},
    ],
    [
      '그 밖의 값은 처리 실패로 본다',
      new Error('keychain unavailable'),
      PROCESSING,
    ],
  ])('%s', (_rule, error, expected) => {
    expect(normalizeAuthError(error)).toEqual(expected);
  });

  test('이미 바꾼 로그인 오류는 그대로 돌려준다', () => {
    const cancelled = createCancelledAuthError();

    expect(normalizeAuthError(cancelled)).toBe(cancelled);
  });
});

test('단계는 처음 붙인 값을 유지한다', () => {
  const first = withAuthErrorStage(httpError(400, 'COMMON400_001'), 'backend_exchange');

  expect(first.stage).toBe('backend_exchange');
  expect(withAuthErrorStage(first, 'provider_authorization').stage).toBe('backend_exchange');
});
