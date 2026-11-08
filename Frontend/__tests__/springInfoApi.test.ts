import {createSpringApiClient} from '../src/lib/api/spring-client';
import {
  configurePlaceReelsRepository,
  getPlaceReels,
} from '../src/entities/info/api';
import {
  springPlaceReelsRepository,
  springProfileRepository,
  springSavedPlacesRepository,
} from '../src/entities/info/spring-api';

jest.mock('../src/lib/api/spring-client', () => ({
  createSpringApiClient: jest.fn(() => ({request: jest.fn()})),
}));

const request = (createSpringApiClient as jest.Mock).mock.results[0].value.request as jest.Mock;

beforeEach(() => request.mockReset());

test('회원 응답을 프로필 화면 모델로 변환한다', async () => {
  request.mockResolvedValue({id: 3, nickname: '담이', imageUrl: null});

  await expect(springProfileRepository.getCurrentProfile()).resolves.toMatchObject({
    id: '3', nickname: '담이', avatarUrl: null,
  });
  expect(request).toHaveBeenCalledWith('/api/v1/members/me');
});

test('장소 ID로 저장 여부와 관계없이 미디어를 조회한다', async () => {
  request.mockResolvedValueOnce({media: [{
    sharedMediaId: 9,
    thumbnailUrl: null,
    author: 'author',
    caption: 'caption',
    sharedUrl: 'https://www.instagram.com/reel/abc/',
    createdAt: '2026-10-15T00:00:00Z',
  }]});

  const media = await springPlaceReelsRepository.getPlaceReels('42');
  expect(request).toHaveBeenCalledTimes(1);
  expect(request).toHaveBeenCalledWith('/api/v1/places/42/media');
  expect(media[0]).toMatchObject({id: '9', instagramAuthorUsername: 'author'});
});

test('장소 조회 함수가 장소 ID를 그대로 전달한다', async () => {
  configurePlaceReelsRepository(springPlaceReelsRepository);
  request.mockResolvedValueOnce({media: []});
  await expect(getPlaceReels('42')).resolves.toEqual([]);
  expect(request).toHaveBeenCalledWith('/api/v1/places/42/media');
});

test('저장 장소 검색은 검색어를 쿼리로 보내고 목록과 같은 모델로 변환한다', async () => {
  request.mockResolvedValue({
    savedPlaces: [{
      savedPlaceId: 7,
      placeId: 42,
      name: '성수 카페',
      category: '음식점 > 카페',
      categoryCode: 'CAFE',
      categoryName: '카페',
      landLotAddress: '성수동 1가',
      roadAddress: '성수이로 1',
      latitude: 37.5,
      longitude: 127.0,
      kakaoPlaceUrl: null,
      thumbnailUrl: null,
      lastSavedAt: '2026-11-04T03:12:45Z',
      folderIds: [3],
    }],
  });
  const places = await springSavedPlacesRepository.searchSavedPlaces('성수 카페');
  expect(request).toHaveBeenCalledWith('/api/v1/saved-places/search', {
    query: {query: '성수 카페'},
  });
  expect(places).toEqual([
    expect.objectContaining({
      id: '7',
      folderIds: ['3'],
      place: expect.objectContaining({id: '42', name: '성수 카페', roadAddress: '성수이로 1'}),
    }),
  ]);
});

test('저장 장소 삭제는 저장 장소 ID 목록을 쿼리로 전송한다', async () => {
  request.mockResolvedValue(undefined);
  await springSavedPlacesRepository.deleteSavedPlaces(['42', '43']);
  expect(request).toHaveBeenCalledWith('/api/v1/saved-places', {
    method: 'DELETE', query: {savedPlaceIds: ['42', '43']},
  });
});
