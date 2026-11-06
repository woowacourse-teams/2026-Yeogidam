import {ApiError} from '../src/lib/api/errors';
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

test('저장 장소 ID로 미디어만 조회한다', async () => {
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
  expect(request).toHaveBeenCalledWith('/api/v1/saved-places/42/media');
  expect(media[0]).toMatchObject({id: '9', instagramAuthorUsername: 'author'});
});

test('이미 지운 저장 장소의 미디어는 오류 대신 빈 목록으로 돌려준다', async () => {
  request.mockRejectedValueOnce(new ApiError({
    kind: 'http',
    status: 404,
    errorCode: 'PLACE404_001',
    message: '저장된 장소가 아닙니다.',
  }));

  await expect(springPlaceReelsRepository.getPlaceReels('42')).resolves.toEqual([]);
});

test('저장 장소 ID가 없으면 미디어를 요청하지 않고 빈 목록을 돌려준다', async () => {
  configurePlaceReelsRepository(springPlaceReelsRepository);

  await expect(getPlaceReels(undefined)).resolves.toEqual([]);
  expect(request).not.toHaveBeenCalled();
});

test('저장 장소 삭제는 저장 장소 ID 목록을 쿼리로 전송한다', async () => {
  request.mockResolvedValue(undefined);
  await springSavedPlacesRepository.deleteSavedPlaces(['42', '43']);
  expect(request).toHaveBeenCalledWith('/api/v1/saved-places', {
    method: 'DELETE', query: {savedPlaceIds: ['42', '43']},
  });
});
