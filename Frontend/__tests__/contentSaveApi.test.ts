import {
  getReelProcessingStatus,
  saveContent,
  toReelApiError,
  toReelStatus,
} from '../src/entities/content/api';
import {requestSharesPage} from '../src/entities/content/shares-request';
import {ReelApiError, normalizeReelError} from '../src/entities/content/errors';
import {ApiError} from '../src/lib/api/errors';

// api.ts와 shares-request.ts가 각자 만든 클라이언트가 같은 요청 mock을 쓰게 합니다.
const mockRequest = jest.fn();
jest.mock('../src/lib/api/spring-client', () => ({
  createSpringApiClient: jest.fn(() => ({request: (...args: unknown[]) => mockRequest(...args)})),
}));

const request = mockRequest;

const share = (
  sharedMediaId: number,
  extractionStatus: string,
  failureReason: string | null = null,
) => ({
  sharedMediaId,
  createdAt: '2026-10-15T00:00:00Z',
  thumbnailUrl: `https://cdn.example.com/${sharedMediaId}.jpg`,
  caption: null,
  author: null,
  extractionStatus,
  failureReason,
  sharedUrl: 'https://www.instagram.com/reel/abc/',
});

/** 공유 목록 배열이 없는 응답들입니다. 빈 목록으로 보면 공유를 찾지 못한 것으로 여기게 됩니다. */
const MALFORMED_SHARES_BODIES: Array<[string, unknown]> = [
  ['sharedMedias 없음', {nextCursor: null}],
  ['sharedMedias가 null', {sharedMedias: null, nextCursor: null}],
  ['본문이 null', null],
];

beforeEach(() => {
  request.mockReset();
});

test('Spring 추출 상태를 화면 처리 상태로 바꾼다', () => {
  expect(toReelStatus('EXTRACTING')).toBe('PROCESSING');
  expect(toReelStatus('SUCCEEDED')).toBe('COMPLETED');
  expect(toReelStatus('FAILED')).toBe('FAILED');
});

test('일반 URL 저장은 정규화한 주소로 공유 API를 호출하고 응답을 변환한다', async () => {
  request.mockResolvedValue({sharedMediaId: 12, extractionStatus: 'EXTRACTING'});

  await expect(
    saveContent('https://www.instagram.com/reel/abc/?igsh=123'),
  ).resolves.toEqual({reelId: '12', status: 'PROCESSING', reused: false});
  expect(request).toHaveBeenCalledWith('/api/v1/shares', {
    method: 'POST',
    body: {instagramUrl: 'https://www.instagram.com/reel/abc/'},
  });
});

test('이미 추출이 끝난 공유는 재사용 완료로 돌려준다', async () => {
  request.mockResolvedValue({sharedMediaId: 3, extractionStatus: 'SUCCEEDED'});

  await expect(
    saveContent('https://www.instagram.com/reel/abc/'),
  ).resolves.toEqual({reelId: '3', status: 'COMPLETED', reused: true});
});

test('지원하지 않는 URL은 추출 요청을 보내지 않는다', async () => {
  await expect(saveContent('https://example.com/reel/abc'))
    .rejects.toMatchObject({errorCode: 'REEL400_001'});
  expect(request).not.toHaveBeenCalled();
});

test('서버 오류 코드와 문구를 유지하고 401은 로그인 필요로 바꾼다', async () => {
  request.mockRejectedValueOnce(new ApiError({
    kind: 'http',
    status: 400,
    errorCode: 'MEDIA400_010',
    message: '올바른 인스타그램 링크 형식이 아닙니다.',
    requestId: 'req-1',
  }));
  const invalid = saveContent('https://www.instagram.com/reel/abc/');
  await expect(invalid).rejects.toBeInstanceOf(ReelApiError);
  await expect(invalid).rejects.toMatchObject({
    errorCode: 'MEDIA400_010',
    message: '올바른 인스타그램 링크 형식이 아닙니다.',
    status: 400,
  });
  // 요청 ID는 화면 오류에 싣지 않습니다.
  await expect(invalid).rejects.not.toHaveProperty('requestId');

  request.mockRejectedValueOnce(new ApiError({
    kind: 'http',
    status: 401,
    errorCode: 'AUTH401_004',
    message: '로그인이 필요한 요청입니다.',
  }));
  await expect(saveContent('https://www.instagram.com/reel/abc/'))
    .rejects.toMatchObject({errorCode: 'AUTH401_001'});

  request.mockRejectedValueOnce(new ApiError({kind: 'timeout', message: 'timeout'}));
  await expect(saveContent('https://www.instagram.com/reel/abc/'))
    .rejects.toMatchObject({errorCode: 'CLIENT000_002', retryable: true});

  // 연결 실패 문구는 전송 계층이 무슨 문구를 주든 고정입니다.
  request.mockRejectedValueOnce(new ApiError({kind: 'network', message: 'offline'}));
  await expect(saveContent('https://www.instagram.com/reel/abc/'))
    .rejects.toMatchObject({
      errorCode: 'CLIENT000_001',
      message: '인터넷 연결을 확인해주세요.',
      retryable: true,
    });
});

test('상태 조회는 공유 목록에서 같은 ID를 찾아 화면 모델로 바꾼다', async () => {
  request.mockResolvedValue({
    sharedMedias: [share(13, 'EXTRACTING'), share(12, 'FAILED', 'PLACE_NOT_MATCHED')],
    nextCursor: null,
  });

  await expect(getReelProcessingStatus('12')).resolves.toEqual({
    id: '12',
    processing_status: 'FAILED',
    failure_reason: 'PLACE_NOT_MATCHED',
    instagram_thumbnail_url: 'https://cdn.example.com/12.jpg',
    created_at: '2026-10-15T00:00:00Z',
  });
  expect(request).toHaveBeenCalledWith('/api/v1/shares');
  await expect(getReelProcessingStatus('99')).resolves.toBeNull();
});

test.each(MALFORMED_SHARES_BODIES)('상태 조회는 공유 목록 응답 모양이 어긋나면(%s) 목록에 없다고 보지 않고 응답 처리 오류로 던진다', async (_shape, body) => {
  request.mockResolvedValue(body);

  const lookup = getReelProcessingStatus('12');
  await expect(lookup).rejects.toBeInstanceOf(ReelApiError);
  await expect(lookup).rejects.toMatchObject({
    status: null,
    errorCode: 'CLIENT000_003',
    message: '응답을 처리하지 못했어요.',
    retryable: false,
  });
});

test('상태 조회의 요청 오류는 공유 API 오류 표로 바꿔 다시 시도할 수 있는 연결 실패로 던진다', async () => {
  request.mockRejectedValue(new ApiError({kind: 'network', message: 'offline'}));

  const lookup = getReelProcessingStatus('12');
  await expect(lookup).rejects.toBeInstanceOf(ReelApiError);
  // 공유 API 표는 전송 계층 문구(offline) 대신 늘 같은 문구로 알린다.
  await expect(lookup).rejects.toMatchObject({
    errorCode: 'CLIENT000_001',
    message: '인터넷 연결을 확인해주세요.',
    retryable: true,
  });
});

test('상태 조회는 다음 커서를 쓰지 않으므로 커서 모양이 어긋나도 목록에서 찾는다', async () => {
  request.mockResolvedValue({sharedMedias: [share(12, 'EXTRACTING')], nextCursor: {}});

  await expect(getReelProcessingStatus('12')).resolves.toMatchObject({id: '12', processing_status: 'PROCESSING'});
});

describe('공유 목록 한 쪽 읽기(requestSharesPage)', () => {
  test('첫 쪽은 커서 쿼리 없이 읽고 공유 목록과 다음 커서를 돌려준다', async () => {
    request.mockResolvedValue({
      sharedMedias: [share(13, 'EXTRACTING')],
      nextCursor: {createdAt: '2026-10-14T00:00:00Z', id: 13},
    });

    await expect(requestSharesPage()).resolves.toEqual({
      sharedMedias: [share(13, 'EXTRACTING')],
      nextCursor: {createdAt: '2026-10-14T00:00:00Z', id: 13},
    });
    expect(request).toHaveBeenCalledWith('/api/v1/shares');
  });

  test('다음 쪽은 커서를 cursorCreatedAt과 cursorId로 보내고, 다음 커서가 빠진 응답은 빠진 그대로 돌려준다', async () => {
    request.mockResolvedValue({sharedMedias: []});

    await expect(
      requestSharesPage({createdAt: '2026-10-14T00:00:00Z', id: 7}),
    ).resolves.toEqual({sharedMedias: [], nextCursor: undefined});
    expect(request).toHaveBeenCalledWith('/api/v1/shares', {
      query: {cursorCreatedAt: '2026-10-14T00:00:00Z', cursorId: '7'},
    });
  });

  test.each(MALFORMED_SHARES_BODIES)('응답 모양이 어긋나면(%s) 빈 목록이 아니라 응답 처리 오류(ApiError invalid_response)로 던진다', async (_shape, body) => {
    request.mockResolvedValue(body);

    const page = requestSharesPage();
    await expect(page).rejects.toBeInstanceOf(ApiError);
    await expect(page).rejects.toMatchObject({kind: 'invalid_response', status: null});
  });

  test('다음 커서는 모양을 보지 않고 받은 그대로 돌려준다. 쓰는 곳(히스토리)이 확인한다', async () => {
    request.mockResolvedValue({sharedMedias: [], nextCursor: {}});

    await expect(requestSharesPage()).resolves.toEqual({sharedMedias: [], nextCursor: {}});
  });

  test('요청 오류는 화면 오류로 바꾸지 않고 받은 그대로 던진다', async () => {
    const offline = new ApiError({kind: 'network', message: 'offline'});
    request.mockRejectedValue(offline);

    await expect(requestSharesPage()).rejects.toBe(offline);
  });
});

describe('공유 API 오류 표(toReelApiError)', () => {
  test.each([
    [
      '토큰을 읽지 못해도 401 로그인 필요로 본다',
      new ApiError({kind: 'auth', message: '로그인 정보를 확인하지 못했어요.'}),
      {status: 401, errorCode: 'AUTH401_001', message: '로그인이 필요해요.', retryable: false},
    ],
    [
      '시간 초과는 토큰 재발급 대기 중이어도 같은 문구로 알린다',
      new ApiError({kind: 'timeout', message: '로그인 정보를 확인하고 있어요. 잠시 후 다시 시도해주세요.'}),
      {
        status: null,
        errorCode: 'CLIENT000_002',
        message: '응답이 늦어지고 있어요. 잠시 후 다시 시도해주세요.',
        retryable: true,
      },
    ],
    [
      '응답을 읽지 못하면 상태를 남기지 않는다',
      new ApiError({kind: 'invalid_response', status: 202, message: '응답을 처리하지 못했어요.'}),
      {status: null, errorCode: 'CLIENT000_003', message: '응답을 처리하지 못했어요.', retryable: false},
    ],
    [
      '나머지 종류는 기본 표를 따른다(코드 없는 5xx)',
      new ApiError({kind: 'http', status: 503, errorCode: null, message: '요청을 처리하지 못했어요.'}),
      {status: 503, errorCode: 'COMMON500_001', message: '요청을 처리하지 못했어요.', retryable: true},
    ],
    [
      'ApiError가 아닌 오류는 처리 실패로 본다',
      new Error('Missing required environment variable: API_BASE_URL'),
      {status: null, errorCode: 'CLIENT000_003', message: '응답을 처리하지 못했어요.', retryable: false},
    ],
  ])('%s', (_rule, error, expected) => {
    const reelError = toReelApiError(error);

    expect(reelError).toBeInstanceOf(ReelApiError);
    expect(reelError).toMatchObject(expected);
    expect(reelError.field).toBeUndefined();
  });

  test('MEDIA400 코드는 링크 입력 필드를 가리킨다', () => {
    expect(
      toReelApiError(new ApiError({
        kind: 'http',
        status: 400,
        errorCode: 'MEDIA400_001',
        message: '지원하지 않는 링크입니다.',
      })),
    ).toMatchObject({errorCode: 'MEDIA400_001', field: 'instagramUrl'});
  });
});

describe('화면의 공유 오류 맞추기(normalizeReelError)', () => {
  test('API에서 온 ReelApiError는 그대로 돌려준다', () => {
    const reelError = new ReelApiError({errorCode: 'AUTH401_001', message: '로그인이 필요해요.', status: 401});

    expect(normalizeReelError(reelError)).toBe(reelError);
  });

  test('응답을 읽다 난 JS 오류는 다시 시도하지 않는 COMMON400_001로 보고, 받지 않은 응답 상태를 싣지 않는다', () => {
    const normalized = normalizeReelError(new TypeError("Cannot read property 'map' of null"));
    expect(normalized).toMatchObject({
      errorCode: 'COMMON400_001',
      message: "Cannot read property 'map' of null",
      retryable: false,
    });
    // 상수의 400을 옮기면 재시도 지표의 응답 상태에 받지 않은 값이 실린다.
    expect(normalized.status).toBeUndefined();
  });

  test('Error가 아닌 값은 다시 시도할 수 있는 연결 실패로 보고, 받지 않은 응답 상태를 싣지 않는다', () => {
    const normalized = normalizeReelError(null);
    expect(normalized).toMatchObject({
      errorCode: 'CLIENT000_001',
      message: '인터넷 연결을 확인해주세요.',
      retryable: true,
    });
    // 재시도 지표는 응답 상태가 숫자일 때만 싣는다. JS 오류 쪽과 같이 받지 않은 응답 상태는 undefined로 둔다.
    expect(normalized.status).toBeUndefined();
  });
});
