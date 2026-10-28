import {createSpringApiClient} from '../src/lib/api/spring-client';
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

const savedPlace = {
  savedPlaceId: 42,
  placeId: 7,
  name: '군자역',
  category: '지하철역',
  landLotAddress: '서울 광진구',
  roadAddress: '서울 광진구 능동로',
  latitude: 37.557,
  longitude: 127.079,
  kakaoPlaceUrl: 'https://place.map.kakao.com/7',
  thumbnailUrl: null,
  lastSavedAt: '2026-10-15T00:00:00Z',
};

test('회원 응답을 프로필 화면 모델로 변환한다', async () => {
  request.mockResolvedValue({id: 3, nickname: '담이', imageUrl: null});

  await expect(springProfileRepository.getCurrentProfile()).resolves.toMatchObject({
    id: '3', nickname: '담이', avatarUrl: null,
  });
  expect(request).toHaveBeenCalledWith('/api/v1/members/me');
});

test('저장 장소 ID와 장소 ID를 구분해 미디어를 조회한다', async () => {
  request.mockResolvedValueOnce({savedPlaces: [savedPlace]});
  request.mockResolvedValueOnce({media: [{
    sharedMediaId: 9,
    thumbnailUrl: null,
    author: 'author',
    caption: 'caption',
    sharedUrl: 'https://www.instagram.com/reel/abc/',
    createdAt: '2026-10-15T00:00:00Z',
  }]});

  const media = await springPlaceReelsRepository.getPlaceReels('7');
  expect(request).toHaveBeenNthCalledWith(2, '/api/v1/saved-places/42/media');
  expect(media[0]).toMatchObject({id: '9', instagramAuthorUsername: 'author'});
});

test('저장 장소 삭제는 저장 장소 ID 목록을 쿼리로 전송한다', async () => {
  request.mockResolvedValue(undefined);
  await springSavedPlacesRepository.deleteSavedPlaces(['42', '43']);
  expect(request).toHaveBeenCalledWith('/api/v1/saved-places', {
    method: 'DELETE', query: {savedPlaceIds: ['42', '43']},
  });
});
