import {getSavedPlaces} from '../src/entities/info/api';
import {
  clearPrefetchedSavedPlaces,
  prefetchSavedPlaces,
  takePrefetchedSavedPlaces,
} from '../src/entities/info/savedPlacesPrefetch';

jest.mock('../src/entities/info/api', () => ({
  getSavedPlaces: jest.fn(),
}));

const SAVED_PLACES = [{savedPlaceId: '1'}];

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(0);
  clearPrefetchedSavedPlaces();
  (getSavedPlaces as jest.Mock).mockReset().mockResolvedValue(SAVED_PLACES);
});

afterEach(() => jest.useRealTimers());

test('미리 요청한 저장 장소를 한 번만 꺼내 준다', async () => {
  prefetchSavedPlaces();

  const prefetched = takePrefetchedSavedPlaces();
  await expect(prefetched).resolves.toBe(SAVED_PLACES);
  expect(getSavedPlaces).toHaveBeenCalledTimes(1);
  expect(takePrefetchedSavedPlaces()).toBeNull();
});

test('10초가 지난 응답은 쓰지 않는다', () => {
  prefetchSavedPlaces();
  jest.setSystemTime(10_001);

  expect(takePrefetchedSavedPlaces()).toBeNull();
});

test('로그아웃·회원 변경으로 지운 응답은 쓰지 않는다', () => {
  prefetchSavedPlaces();
  clearPrefetchedSavedPlaces();

  expect(takePrefetchedSavedPlaces()).toBeNull();
});

test('화면이 꺼내기 전에 실패해도 처리되지 않은 rejection을 남기지 않고, 꺼낸 쪽에 실패를 전달한다', async () => {
  const error = new Error('network');
  (getSavedPlaces as jest.Mock).mockRejectedValue(error);

  prefetchSavedPlaces();

  await expect(takePrefetchedSavedPlaces()).rejects.toBe(error);
});
