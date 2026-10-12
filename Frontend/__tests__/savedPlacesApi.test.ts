import {
  createServerPlaceReelsRepository,
  createServerSavedPlacesRepository,
} from '../src/entities/info/api';
import { ApiError } from '../src/lib/api/errors';

const BASE_URL = 'https://api.example.com';

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// 픽스처 값은 서버 SavedPlaceE2eTest의 가상 장소와 SavedPlaceApiDocs의 응답 예시를 옮겼습니다.
const savedPlaceResponsesFixture = {
  savedPlaces: [
    {
      savedPlaceId: 13,
      placeId: 3,
      name: '경복궁',
      category: '관광명소',
      landLotAddress: '서울 종로구 세종로 1-1',
      roadAddress: '서울 종로구 사직로 161',
      latitude: 37.5796,
      longitude: 126.977,
      kakaoPlaceUrl: 'https://place.map.kakao.com/3',
      telephone: null,
      thumbnailUrl: 'https://img.example.com/3.jpg',
      thumbnailSource: 'KAKAO',
      lastSavedAt: '2026-09-15T00:00:10Z',
    },
    {
      // 비어 있을 수 있는 열이 모두 null인 장소입니다.
      savedPlaceId: 12,
      placeId: 2,
      name: '윤숲 후르츠산도',
      category: null,
      landLotAddress: '서울 광진구 화양동 1-1',
      roadAddress: null,
      latitude: 37.54,
      longitude: 127.07,
      kakaoPlaceUrl: null,
      telephone: null,
      thumbnailUrl: null,
      thumbnailSource: null,
      lastSavedAt: '2026-09-15T00:00:05Z',
    },
    {
      savedPlaceId: 11,
      placeId: 1,
      name: '카페 온월',
      category: '음식점 > 카페',
      landLotAddress: '서울 성동구 성수동2가 289-10',
      roadAddress: '서울 성동구 성수이로 26 2층',
      latitude: 37.5445,
      longitude: 127.0561,
      kakaoPlaceUrl: 'https://place.map.kakao.com/1',
      telephone: '02-1234-5678',
      thumbnailUrl: 'https://img.example.com/1.jpg',
      thumbnailSource: 'INSTAGRAM',
      lastSavedAt: '2026-09-15T00:00:00Z',
    },
  ],
};

const savedPlaceMediaResponsesFixture = {
  media: [
    {
      sharedMediaId: 102,
      thumbnailUrl: 'https://img.example.com/reel10.jpg',
      author: '@seongsu_life',
      caption: '성수 카페 투어',
      sharedUrl: 'https://www.instagram.com/reel/C1seongsu/',
      createdAt: '2026-09-12T10:00:00Z',
    },
  ],
};

/** 게시글 정보를 읽지 못한 릴스입니다. */
const savedPlaceMediaWithoutMetadataFixture = {
  media: [
    {
      sharedMediaId: 103,
      thumbnailUrl: null,
      author: null,
      caption: null,
      sharedUrl: 'https://www.instagram.com/reel/C1nometa/',
      createdAt: '2026-09-13T10:00:00Z',
    },
  ],
};

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
});

describe('saved places list', () => {
  async function getSavedPlacesFromFixture() {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(jsonResponse(200, savedPlaceResponsesFixture));
    globalThis.fetch = fetchMock;
    const repository = createServerSavedPlacesRepository({
      baseUrl: `${BASE_URL}/`,
      getAccessToken: async () => 'access-token',
    });

    return { fetchMock, savedPlaces: await repository.getSavedPlaces() };
  }

  it('requests the saved places once and maps all 13 response fields with string ids', async () => {
    const { fetchMock, savedPlaces } = await getSavedPlacesFromFixture();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(`${BASE_URL}/api/v1/saved-places`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer access-token',
      },
    });
    expect(savedPlaces.map(savedPlace => savedPlace.id)).toEqual([
      '13',
      '12',
      '11',
    ]);
    expect(savedPlaces[2]).toEqual({
      id: '11',
      lastSavedAt: '2026-09-15T00:00:00Z',
      place: {
        id: '1',
        name: '카페 온월',
        category: '음식점 > 카페',
        landLotAddress: '서울 성동구 성수동2가 289-10',
        roadAddress: '서울 성동구 성수이로 26 2층',
        shortAddress: '서울 성동구',
        latitude: 37.5445,
        longitude: 127.0561,
        kakaoPlaceUrl: 'https://place.map.kakao.com/1',
        telephone: '02-1234-5678',
        thumbnailUrl: 'https://img.example.com/1.jpg',
        thumbnailSource: 'INSTAGRAM',
      },
    });
  });

  it('keeps a missing thumbnail and other empty fields as null', async () => {
    const { savedPlaces } = await getSavedPlacesFromFixture();

    expect(savedPlaces[1].place).toEqual(
      expect.objectContaining({
        id: '2',
        category: null,
        roadAddress: null,
        kakaoPlaceUrl: null,
        telephone: null,
        thumbnailUrl: null,
        thumbnailSource: null,
      }),
    );
  });

  it('builds the card address from the first two words of the land-lot address', async () => {
    const { savedPlaces } = await getSavedPlacesFromFixture();

    expect(
      savedPlaces.map(savedPlace => savedPlace.place.shortAddress),
    ).toEqual(['서울 종로구', '서울 광진구', '서울 성동구']);
  });
});

describe('saved places deletion', () => {
  it('deletes every selected saved place with one request and no body', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    globalThis.fetch = fetchMock;
    const repository = createServerSavedPlacesRepository({
      baseUrl: BASE_URL,
      getAccessToken: async () => 'access-token',
    });

    await repository.deleteSavedPlaces(['13', '11']);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/api/v1/saved-places?savedPlaceIds=13%2C11`,
      {
        method: 'DELETE',
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer access-token',
        },
      },
    );
  });
});

describe('place reels', () => {
  it('reads the reels of the saved place with one request and maps each reel', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(jsonResponse(200, savedPlaceMediaResponsesFixture));
    globalThis.fetch = fetchMock;
    const repository = createServerPlaceReelsRepository({
      baseUrl: BASE_URL,
      getAccessToken: async () => 'access-token',
    });

    const reels = await repository.getPlaceReels('11');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/api/v1/saved-places/11/media`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer access-token',
        },
      },
    );
    expect(reels).toEqual([
      {
        id: '102',
        instagramUrl: 'https://www.instagram.com/reel/C1seongsu/',
        instagramAuthorUsername: '@seongsu_life',
        instagramDescription: '성수 카페 투어',
        instagramThumbnailUrl: 'https://img.example.com/reel10.jpg',
        createdAt: '2026-09-12T10:00:00Z',
      },
    ]);
  });

  it('keeps missing reel metadata as null', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(
        jsonResponse(200, savedPlaceMediaWithoutMetadataFixture),
      );
    const repository = createServerPlaceReelsRepository({ baseUrl: BASE_URL });

    await expect(repository.getPlaceReels('11')).resolves.toEqual([
      {
        id: '103',
        instagramUrl: 'https://www.instagram.com/reel/C1nometa/',
        instagramAuthorUsername: null,
        instagramDescription: null,
        instagramThumbnailUrl: null,
        createdAt: '2026-09-13T10:00:00Z',
      },
    ]);
  });

  it('passes the server error through when the saved place is not found', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(
      jsonResponse(404, {
        message: '저장된 장소가 아닙니다.',
        errorCode: 'PLACE404_001',
      }),
    );
    const repository = createServerPlaceReelsRepository({ baseUrl: BASE_URL });

    const error = await repository.getPlaceReels('99').catch(e => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 404,
      errorCode: 'PLACE404_001',
      message: '저장된 장소가 아닙니다.',
    });
  });
});
