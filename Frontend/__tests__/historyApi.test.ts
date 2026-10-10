import { createServerHistoryRepository } from '../src/entities/content/api';
import { ApiError } from '../src/lib/api/errors';

const BASE_URL = 'https://api.example.com';

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'req-1' },
  });
}

/** 첫 페이지입니다. nextCursor는 마지막 항목(812)의 createdAt과 id이고 마이크로초까지 있습니다. */
const firstPage = {
  sharedMedias: [
    {
      sharedMediaId: 814,
      createdAt: '2026-09-21T01:00:00Z',
      thumbnailUrl: null,
      caption: null,
      author: null,
      extractionStatus: 'EXTRACTING',
      failureReason: null,
      sharedUrl: 'https://www.instagram.com/reel/C1extracting/',
    },
    {
      sharedMediaId: 813,
      createdAt: '2026-09-20T08:00:00Z',
      thumbnailUrl: 'https://img.example.com/reel10.jpg',
      caption: '성수 카페 투어',
      author: '@seongsu_life',
      extractionStatus: 'SUCCEEDED',
      failureReason: null,
      sharedUrl: 'https://www.instagram.com/reel/C1seongsu/',
    },
    {
      sharedMediaId: 812,
      createdAt: '2026-09-20T03:12:45.123456Z',
      thumbnailUrl: null,
      caption: null,
      author: null,
      extractionStatus: 'FAILED',
      failureReason: 'CONTENT_UNAVAILABLE',
      sharedUrl: 'https://www.instagram.com/reel/C1failed/',
    },
  ],
  nextCursor: { createdAt: '2026-09-20T03:12:45.123456Z', id: 812 },
};

const lastPage = {
  sharedMedias: [
    {
      sharedMediaId: 811,
      createdAt: '2026-09-17T10:00:00Z',
      thumbnailUrl: 'https://img.example.com/reel11.jpg',
      caption: '종로 맛집',
      author: '@jongno_food',
      extractionStatus: 'SUCCEEDED',
      failureReason: null,
      sharedUrl: 'https://www.instagram.com/reel/C1jongno/',
    },
  ],
  nextCursor: null,
};

function createRepository() {
  return createServerHistoryRepository({
    baseUrl: BASE_URL,
    getAccessToken: async () => 'access-token',
  });
}

async function rejectionOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error;
  }

  throw new Error('Expected the request to fail.');
}

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
});

describe('history list', () => {
  it('maps the eight server fields with string ids and keeps the extraction vocabulary', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, firstPage));
    globalThis.fetch = fetchMock;

    const result = await createRepository().getHistoryReels();

    expect(fetchMock).toHaveBeenCalledWith(`${BASE_URL}/api/v1/shares`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer access-token',
      },
    });
    expect(result.reels).toEqual([
      {
        sharedMediaId: '814',
        createdAt: '2026-09-21T01:00:00Z',
        thumbnailUrl: null,
        caption: null,
        author: null,
        extractionStatus: 'EXTRACTING',
        failureReason: null,
        sharedUrl: 'https://www.instagram.com/reel/C1extracting/',
      },
      {
        sharedMediaId: '813',
        createdAt: '2026-09-20T08:00:00Z',
        thumbnailUrl: 'https://img.example.com/reel10.jpg',
        caption: '성수 카페 투어',
        author: '@seongsu_life',
        extractionStatus: 'SUCCEEDED',
        failureReason: null,
        sharedUrl: 'https://www.instagram.com/reel/C1seongsu/',
      },
      {
        sharedMediaId: '812',
        createdAt: '2026-09-20T03:12:45.123456Z',
        thumbnailUrl: null,
        caption: null,
        author: null,
        extractionStatus: 'FAILED',
        failureReason: 'CONTENT_UNAVAILABLE',
        sharedUrl: 'https://www.instagram.com/reel/C1failed/',
      },
    ]);
  });

  it('sends the next cursor back with the exact strings it received', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, firstPage))
      .mockResolvedValueOnce(jsonResponse(200, lastPage));
    globalThis.fetch = fetchMock;
    const repository = createRepository();

    const first = await repository.getHistoryReels();
    const last = await repository.getHistoryReels(
      first.nextCursor ?? undefined,
    );

    expect(first.nextCursor).toEqual({
      createdAt: '2026-09-20T03:12:45.123456Z',
      id: '812',
    });
    expect(fetchMock.mock.calls[1][0]).toBe(
      `${BASE_URL}/api/v1/shares?cursorCreatedAt=2026-09-20T03%3A12%3A45.123456Z&cursorId=812`,
    );
    expect(last.reels.map(reel => reel.sharedMediaId)).toEqual(['811']);
    expect(last.nextCursor).toBeNull();
  });

  it('reads omitted nullable fields as null', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        sharedMedias: [
          {
            sharedMediaId: 820,
            createdAt: '2026-09-22T00:00:00Z',
            extractionStatus: 'EXTRACTING',
            sharedUrl: 'https://www.instagram.com/reel/C1omitted/',
          },
        ],
        nextCursor: null,
      }),
    );

    const result = await createRepository().getHistoryReels();

    expect(result.reels[0]).toMatchObject({
      thumbnailUrl: null,
      caption: null,
      author: null,
      failureReason: null,
    });
  });
});

describe('history places', () => {
  it('requests the places of one shared media and maps them with string ids', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        places: [
          {
            placeId: 2,
            thumbnailUrl: 'https://img.example.com/place-2.jpg',
            name: '종로 식당',
            category: '식당',
            landLotAddress: '서울 종로구 관철동 1-1',
            roadAddress: '서울 종로구 삼일대로 1',
          },
          {
            placeId: 1,
            thumbnailUrl: null,
            name: '성수 카페',
            category: null,
            landLotAddress: '서울 성동구 성수동2가 1-1',
            roadAddress: null,
          },
        ],
      }),
    );
    globalThis.fetch = fetchMock;

    const places = await createRepository().getHistoryReelPlaces('813');

    expect(fetchMock.mock.calls[0][0]).toBe(
      `${BASE_URL}/api/v1/shares/813/places`,
    );
    expect(places).toEqual([
      {
        placeId: '2',
        thumbnailUrl: 'https://img.example.com/place-2.jpg',
        name: '종로 식당',
        category: '식당',
        landLotAddress: '서울 종로구 관철동 1-1',
        roadAddress: '서울 종로구 삼일대로 1',
      },
      {
        placeId: '1',
        thumbnailUrl: null,
        name: '성수 카페',
        category: null,
        landLotAddress: '서울 성동구 성수동2가 1-1',
        roadAddress: null,
      },
    ]);
  });
});

describe('extraction retry', () => {
  it.each(['EXTRACTING', 'SUCCEEDED'])(
    'returns the history id from the 202 response when it is %s',
    async extractionStatus => {
      const fetchMock = jest
        .fn()
        .mockResolvedValue(
          jsonResponse(202, { sharedMediaId: 815, extractionStatus }),
        );
      globalThis.fetch = fetchMock;

      await expect(
        createRepository().retryHistoryExtraction('812'),
      ).resolves.toEqual({ sharedMediaId: '815', extractionStatus });
      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE_URL}/api/v1/shares/812/extraction-retries`,
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            Authorization: 'Bearer access-token',
          },
        },
      );
    },
  );

  it.each([
    ['MEDIA400_002', '추출에 성공한 게시물은 다시 시도할 수 없습니다.'],
    ['MEDIA400_006', '추출이 진행 중인 게시물은 다시 시도할 수 없습니다.'],
    ['MEDIA400_016', '현재 분석 버전에서는 재시도가 불가능합니다.'],
  ])(
    'keeps the server message of %s so the screen can show it',
    async (errorCode, message) => {
      globalThis.fetch = jest
        .fn()
        .mockResolvedValue(jsonResponse(400, { message, errorCode }));

      const error = await rejectionOf(
        createRepository().retryHistoryExtraction('812'),
      );

      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ status: 400, errorCode, message });
    },
  );
});

describe('history report', () => {
  it('resolves when the server accepts the report with 201', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(new Response(null, { status: 201 }));
    globalThis.fetch = fetchMock;

    await expect(
      createRepository().reportHistoryReel('812'),
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/api/v1/shares/812/reports`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer access-token',
        },
      },
    );
  });

  it('rejects with MEDIA409_001 when the same history was already reported', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(
      jsonResponse(409, {
        message: '이미 신고한 공유입니다.',
        errorCode: 'MEDIA409_001',
      }),
    );

    const error = await rejectionOf(
      createRepository().reportHistoryReel('812'),
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 409,
      errorCode: 'MEDIA409_001',
      requestId: 'req-1',
    });
  });
});
