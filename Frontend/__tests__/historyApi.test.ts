import type {SpringExtractionStatus} from '../src/entities/content/api';
import {ReelApiError} from '../src/entities/content/errors';
import {
  getHistoryReelDetail,
  getHistoryReels,
  reportHistoryReel,
  retryHistoryReelExtraction,
  toHistoryReel,
} from '../src/entities/content/history-api';
import {ApiError} from '../src/lib/api/errors';

const mockRequest = jest.fn();

jest.mock('../src/lib/api/spring-client', () => ({
  createSpringApiClient: jest.fn(() => ({
    request: (...args: unknown[]) => mockRequest(...args),
  })),
}));

const share = (
  sharedMediaId: number,
  extractionStatus: SpringExtractionStatus,
  failureReason: string | null = null,
) => ({
  sharedMediaId,
  createdAt: '2026-10-15T00:00:00Z',
  thumbnailUrl: `https://cdn.example.com/${sharedMediaId}.jpg`,
  caption: '성수 카페 모음',
  author: 'yeogidam',
  extractionStatus,
  failureReason,
  sharedUrl: 'https://www.instagram.com/reel/abc/',
});

beforeEach(() => {
  mockRequest.mockReset();
});

test('공유 목록을 히스토리 카드 형태와 다음 커서로 바꾼다', async () => {
  mockRequest.mockResolvedValue({
    sharedMedias: [share(9, 'EXTRACTING'), share(8, 'SUCCEEDED'), share(7, 'FAILED', '장소 없음')],
    nextCursor: {createdAt: '2026-10-14T00:00:00Z', id: 7},
  });

  const result = await getHistoryReels();

  expect(mockRequest).toHaveBeenCalledWith('/api/v1/shares', {query: undefined});
  expect(result.nextCursor).toEqual({created_at: '2026-10-14T00:00:00Z', id: '7'});
  expect(result.reels.map(reel => reel.processing_status)).toEqual([
    'PROCESSING',
    'COMPLETED',
    'FAILED',
  ]);
  expect(result.reels[2]).toEqual({
    id: '7',
    instagram_url: 'https://www.instagram.com/reel/abc/',
    instagram_title: null,
    instagram_description: '성수 카페 모음',
    instagram_author_username: 'yeogidam',
    instagram_thumbnail_url: 'https://cdn.example.com/7.jpg',
    processing_status: 'FAILED',
    failure_reason: '장소 없음',
    save_mode: null,
    created_at: '2026-10-15T00:00:00Z',
  });
});

test('커서를 cursorCreatedAt과 cursorId로 보내고 마지막 페이지는 null 커서를 돌려준다', async () => {
  mockRequest.mockResolvedValue({sharedMedias: [], nextCursor: null});

  await expect(
    getHistoryReels({created_at: '2026-10-14T00:00:00Z', id: '7'}),
  ).resolves.toEqual({reels: [], nextCursor: null});
  expect(mockRequest).toHaveBeenCalledWith('/api/v1/shares', {
    query: {cursorCreatedAt: '2026-10-14T00:00:00Z', cursorId: '7'},
  });
});

test('추출 성공 공유의 상세는 목록을 다시 읽지 않고 장소 목록을 순서대로 붙인다', async () => {
  mockRequest
    .mockResolvedValueOnce({
      places: [
        {
          placeId: 31,
          thumbnailUrl: 'https://cdn.example.com/p31.jpg',
          name: '카페 A',
          category: '카페',
          landLotAddress: '서울 성동구 성수동1가 1',
          roadAddress: '서울 성동구 왕십리로 1',
        },
        {
          placeId: 32,
          thumbnailUrl: null,
          name: '식당 B',
          category: null,
          landLotAddress: null,
          roadAddress: null,
        },
      ],
    });

  // 첫 페이지 밖(51번째 이후)의 공유도 목록에서 받은 정보로 장소를 조회한다.
  const detail = await getHistoryReelDetail(toHistoryReel(share(8, 'SUCCEEDED')));

  expect(mockRequest).toHaveBeenCalledTimes(1);
  expect(mockRequest).toHaveBeenCalledWith('/api/v1/shares/8/places');
  expect(detail?.processing_status).toBe('COMPLETED');
  expect(detail?.extraction?.extraction_places).toEqual([
    {
      id: '31',
      position: 0,
      place: {
        id: '31',
        name: '카페 A',
        category: '카페',
        source_address: null,
        road_address: '서울 성동구 왕십리로 1',
        address: '서울 성동구 성수동1가 1',
        latitude: null,
        longitude: null,
        kakao_place_url: null,
        thumbnail_url: 'https://cdn.example.com/p31.jpg',
        photo_attribution: null,
      },
    },
    expect.objectContaining({id: '32', position: 1}),
  ]);
});

test('추출 중·실패 공유의 상세는 장소를 조회하지 않는다', async () => {
  await expect(
    getHistoryReelDetail(toHistoryReel(share(9, 'EXTRACTING'))),
  ).resolves.toMatchObject({
    id: '9',
    processing_status: 'PROCESSING',
    extraction: null,
  });
  await expect(
    getHistoryReelDetail(toHistoryReel(share(7, 'FAILED'))),
  ).resolves.toMatchObject({extraction: null});
  expect(mockRequest).not.toHaveBeenCalled();
});

test('제보는 reports API를 호출하고 이미 신고한 공유는 성공으로 본다', async () => {
  mockRequest.mockResolvedValueOnce(undefined);
  await expect(reportHistoryReel('7')).resolves.toBeUndefined();
  expect(mockRequest).toHaveBeenCalledWith('/api/v1/shares/7/reports', {method: 'POST'});

  mockRequest.mockRejectedValueOnce(
    new ApiError({kind: 'http', status: 409, errorCode: 'MEDIA409_001', message: '이미 신고한 공유입니다.'}),
  );
  await expect(reportHistoryReel('7')).resolves.toBeUndefined();
});

test('그 밖의 서버 오류는 ReelApiError로 바꿔 던진다', async () => {
  mockRequest.mockRejectedValue(
    new ApiError({kind: 'http', status: 404, errorCode: 'MEDIA404_002', message: '존재하지 않는 공유입니다.'}),
  );

  await expect(reportHistoryReel('7')).rejects.toMatchObject({
    errorCode: 'MEDIA404_002',
    status: 404,
  });
  await expect(getHistoryReels()).rejects.toBeInstanceOf(ReelApiError);
});

test('추출 재시도는 extraction-retries API를 호출하고 새 공유 ID를 돌려준다', async () => {
  mockRequest.mockResolvedValueOnce({sharedMediaId: 12, extractionStatus: 'EXTRACTING'});

  await expect(retryHistoryReelExtraction('7')).resolves.toEqual({
    reelId: '12',
    status: 'PROCESSING',
    reused: false,
  });
  expect(mockRequest).toHaveBeenCalledWith('/api/v1/shares/7/extraction-retries', {
    method: 'POST',
  });

  mockRequest.mockRejectedValueOnce(
    new ApiError({
      kind: 'http',
      status: 400,
      errorCode: 'MEDIA400_016',
      message: '현재 분석 버전에서는 재시도가 불가능합니다.',
    }),
  );
  await expect(retryHistoryReelExtraction('7')).rejects.toMatchObject({
    errorCode: 'MEDIA400_016',
    message: '현재 분석 버전에서는 재시도가 불가능합니다.',
  });
});
