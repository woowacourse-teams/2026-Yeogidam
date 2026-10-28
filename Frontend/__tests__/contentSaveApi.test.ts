import {
  getLatestProcessingReel,
  getReelProcessingStatus,
  saveContent,
  toReelStatus,
} from '../src/entities/content/api';
import {ReelApiError} from '../src/entities/content/errors';
import {ApiError} from '../src/lib/api/errors';
import {createSpringApiClient} from '../src/lib/api/spring-client';

jest.mock('../src/lib/api/spring-client', () => ({
  createSpringApiClient: jest.fn(() => ({request: jest.fn()})),
}));

const request = (createSpringApiClient as jest.Mock).mock.results[0].value
  .request as jest.Mock;

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
    saveContent('https://www.instagram.com/reel/abc/?igsh=123', 'url_input', 'client-id'),
  ).resolves.toEqual({reelId: '12', status: 'PROCESSING', reused: false});
  expect(request).toHaveBeenCalledWith('/api/v1/shares', {
    method: 'POST',
    body: {instagramUrl: 'https://www.instagram.com/reel/abc/'},
  });
});

test('이미 추출이 끝난 공유는 재사용 완료로 돌려준다', async () => {
  request.mockResolvedValue({sharedMediaId: 3, extractionStatus: 'SUCCEEDED'});

  await expect(
    saveContent('https://www.instagram.com/reel/abc/', 'instagram_share'),
  ).resolves.toEqual({reelId: '3', status: 'COMPLETED', reused: true});
});

test('지원하지 않는 URL은 추출 요청을 보내지 않는다', async () => {
  await expect(saveContent('https://example.com/reel/abc', 'url_input'))
    .rejects.toMatchObject({errorCode: 'REEL400_001'});
  expect(request).not.toHaveBeenCalled();
});

test('서버 오류 코드와 문구를 유지하고 401은 로그인 필요로 바꾼다', async () => {
  request.mockRejectedValueOnce(new ApiError({
    kind: 'http',
    status: 400,
    errorCode: 'MEDIA400_010',
    message: '올바른 인스타그램 링크 형식이 아닙니다.',
  }));
  const invalid = saveContent('https://www.instagram.com/reel/abc/', 'url_input');
  await expect(invalid).rejects.toBeInstanceOf(ReelApiError);
  await expect(invalid).rejects.toMatchObject({
    errorCode: 'MEDIA400_010',
    message: '올바른 인스타그램 링크 형식이 아닙니다.',
    status: 400,
  });

  request.mockRejectedValueOnce(new ApiError({
    kind: 'http',
    status: 401,
    errorCode: 'AUTH401_004',
    message: '로그인이 필요한 요청입니다.',
  }));
  await expect(saveContent('https://www.instagram.com/reel/abc/', 'url_input'))
    .rejects.toMatchObject({errorCode: 'AUTH401_001'});

  request.mockRejectedValueOnce(new ApiError({kind: 'timeout', message: 'timeout'}));
  await expect(saveContent('https://www.instagram.com/reel/abc/', 'url_input'))
    .rejects.toMatchObject({errorCode: 'CLIENT000_002', retryable: true});

  request.mockRejectedValueOnce(new ApiError({kind: 'network', message: 'offline'}));
  await expect(saveContent('https://www.instagram.com/reel/abc/', 'url_input'))
    .rejects.toMatchObject({errorCode: 'CLIENT000_001', retryable: true});
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

test('최신 처리중 릴스는 목록의 첫 EXTRACTING 공유다', async () => {
  request.mockResolvedValue({
    sharedMedias: [share(14, 'SUCCEEDED'), share(13, 'EXTRACTING'), share(12, 'EXTRACTING')],
    nextCursor: null,
  });

  await expect(getLatestProcessingReel()).resolves.toMatchObject({
    id: '13',
    processing_status: 'PROCESSING',
  });
});
