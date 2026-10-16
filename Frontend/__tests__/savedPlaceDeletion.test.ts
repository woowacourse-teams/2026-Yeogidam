import {deleteSavedPlaces, getSavedPlaces} from '../src/entities/info/api';
import {deleteSavedPlaceAndRemoveFromCache} from '../src/entities/info/saved-place-deletion';
import {
  clearSavedPlacesCache,
  getSavedPlacesCacheGeneration,
  readSavedPlacesCache,
  writeSavedPlacesCache,
} from '../src/entities/info/saved-places-cache';
import {NETWORK_ERROR, PROCESSING_ERROR} from '../src/lib/api/screen-error';
import {AUTH_ERROR, BAKERY, CAFE, SERVER_ERROR, TIMEOUT_ERROR, place} from './support/savedPlacesFixtures';

jest.mock('../src/entities/info/api', () => ({
  deleteSavedPlaces: jest.fn(),
  getSavedPlaces: jest.fn(),
}));

// 캐시에는 화면 장소(place)를, 다시 읽은 목록에는 응답 항목(CAFE, BAKERY)을 둡니다. 둘 다 저장 ID(saved-1, saved-2)로 같은 장소를 가리킵니다.
const cachedNames = () => readSavedPlacesCache()?.map(cached => cached.name);

beforeEach(() => {
  clearSavedPlacesCache();
  writeSavedPlacesCache([place('카페', 'saved-1'), place('빵집', 'saved-2')], getSavedPlacesCacheGeneration());
  jest.mocked(deleteSavedPlaces).mockReset().mockResolvedValue(undefined);
  jest.mocked(getSavedPlaces).mockReset();
});

test('지우기에 성공하면 목록을 다시 읽지 않고 그 장소를 캐시에서 뺀다', async () => {
  await expect(deleteSavedPlaceAndRemoveFromCache('saved-1')).resolves.toBeUndefined();

  expect(deleteSavedPlaces).toHaveBeenCalledWith(['saved-1']);
  expect(getSavedPlaces).not.toHaveBeenCalled();
  expect(cachedNames()).toEqual(['빵집']);
});

test('캐시가 비어 있어도 지우면 캐시 세대를 올려, 진행 중이던 보관함 조회가 지운 장소를 캐시에 쓰지 않게 한다', async () => {
  clearSavedPlacesCache();
  const generationBeforeDelete = getSavedPlacesCacheGeneration();

  await expect(deleteSavedPlaceAndRemoveFromCache('saved-1')).resolves.toBeUndefined();

  expect(getSavedPlacesCacheGeneration()).toBeGreaterThan(generationBeforeDelete);
  expect(readSavedPlacesCache()).toBeNull();
});

test('시간 초과로 실패해도 다시 읽은 목록에 없으면 지운 것으로 보고 캐시에서 빼며, 지우기를 다시 보내지는 않는다', async () => {
  jest.mocked(deleteSavedPlaces).mockRejectedValue(TIMEOUT_ERROR);
  jest.mocked(getSavedPlaces).mockResolvedValue([BAKERY]);

  await expect(deleteSavedPlaceAndRemoveFromCache('saved-1')).resolves.toBeUndefined();

  expect(deleteSavedPlaces).toHaveBeenCalledTimes(1);
  expect(getSavedPlaces).toHaveBeenCalledTimes(1);
  expect(cachedNames()).toEqual(['빵집']);
});

test('시간 초과 뒤 다시 읽은 목록에 남아 있으면 처음의 시간 초과 오류를 던지고 캐시를 그대로 둔다', async () => {
  jest.mocked(deleteSavedPlaces).mockRejectedValue(TIMEOUT_ERROR);
  jest.mocked(getSavedPlaces).mockResolvedValue([CAFE, BAKERY]);

  await expect(deleteSavedPlaceAndRemoveFromCache('saved-1')).rejects.toEqual(TIMEOUT_ERROR);

  expect(deleteSavedPlaces).toHaveBeenCalledTimes(1);
  expect(cachedNames()).toEqual(['카페', '빵집']);
});

test('시간 초과 뒤 다시 읽기도 실패하면 다시 읽기 오류 대신 처음의 시간 초과 오류를 던진다', async () => {
  jest.mocked(deleteSavedPlaces).mockRejectedValue(TIMEOUT_ERROR);
  jest.mocked(getSavedPlaces).mockRejectedValue(SERVER_ERROR);

  await expect(deleteSavedPlaceAndRemoveFromCache('saved-1')).rejects.toEqual(TIMEOUT_ERROR);

  expect(cachedNames()).toEqual(['카페', '빵집']);
});

test('시간 초과 뒤 다시 읽기가 로그인 필요로 실패해도 로그인 오류가 아니라 처음의 시간 초과 오류를 던진다', async () => {
  jest.mocked(deleteSavedPlaces).mockRejectedValue(TIMEOUT_ERROR);
  jest.mocked(getSavedPlaces).mockRejectedValue(AUTH_ERROR);

  await expect(deleteSavedPlaceAndRemoveFromCache('saved-1')).rejects.toEqual(TIMEOUT_ERROR);

  expect(cachedNames()).toEqual(['카페', '빵집']);
});

test('네트워크 오류처럼 시간 초과가 아닌 다시 시도할 수 있는 실패는 목록을 다시 읽지 않고 그 오류를 던진다', async () => {
  jest.mocked(deleteSavedPlaces).mockRejectedValue({...NETWORK_ERROR});

  await expect(deleteSavedPlaceAndRemoveFromCache('saved-1')).rejects.toEqual({...NETWORK_ERROR});

  expect(getSavedPlaces).not.toHaveBeenCalled();
  expect(cachedNames()).toEqual(['카페', '빵집']);
});

test('시간 초과가 아닌 실패는 목록을 다시 읽지 않고 그 오류를 던진다', async () => {
  jest.mocked(deleteSavedPlaces).mockRejectedValue(SERVER_ERROR);

  await expect(deleteSavedPlaceAndRemoveFromCache('saved-1')).rejects.toEqual(SERVER_ERROR);

  expect(getSavedPlaces).not.toHaveBeenCalled();
  expect(cachedNames()).toEqual(['카페', '빵집']);
});

test('화면 오류 계약 모양이 아닌 실패는 응답 처리 오류로 맞춰 던진다', async () => {
  jest.mocked(deleteSavedPlaces).mockRejectedValue(new Error('boom'));

  await expect(deleteSavedPlaceAndRemoveFromCache('saved-1')).rejects.toEqual({...PROCESSING_ERROR});

  expect(getSavedPlaces).not.toHaveBeenCalled();
  expect(cachedNames()).toEqual(['카페', '빵집']);
});
