import {createSpringApiClient} from '../src/lib/api/spring-client';
import {springSavedPlacesRepository} from '../src/entities/info/spring-api';
import {toSavedPlaceDisplayPlace} from '../src/entities/place/api';

jest.mock('../src/lib/api/spring-client', () => ({
  createSpringApiClient: jest.fn(() => ({request: jest.fn()})),
}));

const request = (createSpringApiClient as jest.Mock).mock.results[0].value.request as jest.Mock;

function savedPlaceResponse(savedPlaceId: number, folderIds?: number[] | null) {
  return {
    savedPlaceId,
    placeId: savedPlaceId + 100,
    name: '성수 카페',
    category: null,
    landLotAddress: '서울 성동구 성수동',
    roadAddress: null,
    latitude: 37.54,
    longitude: 127.05,
    kakaoPlaceUrl: null,
    thumbnailUrl: null,
    lastSavedAt: '2026-10-29T00:00:00',
    folderIds,
  };
}

beforeEach(() => request.mockReset());

test('보관함 응답의 folderIds를 담은 순서 그대로 문자열 id로 바꾼다', async () => {
  request.mockResolvedValue({savedPlaces: [savedPlaceResponse(1, [3, 1])]});

  const [savedPlace] = await springSavedPlacesRepository.getSavedPlaces();

  expect(savedPlace.folderIds).toEqual(['3', '1']);
  expect(toSavedPlaceDisplayPlace(savedPlace)).toMatchObject({
    savedPlaceId: '1',
    folderIds: ['3', '1'],
  });
});

test('folderIds가 없거나 null이면 빈 배열로 둔다', async () => {
  request.mockResolvedValue({savedPlaces: [
    savedPlaceResponse(1),
    savedPlaceResponse(2, null),
  ]});

  const savedPlaces = await springSavedPlacesRepository.getSavedPlaces();

  expect(savedPlaces.map(savedPlace => savedPlace.folderIds)).toEqual([[], []]);
});
