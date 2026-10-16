import {deleteSavedPlaces, getSavedPlaces} from '../src/entities/info/api';
import {deleteSavedPlaceAndRemoveFromCache} from '../src/entities/info/saved-place-deletion';
import {
  clearSavedPlacesCache,
  getSavedPlacesCacheGeneration,
  readSavedPlacesCache,
  writeSavedPlacesCache,
} from '../src/entities/info/saved-places-cache';
import {NETWORK_ERROR, PROCESSING_ERROR} from '../src/lib/api/screen-error';
import {cachedPlaceNames} from './support/cachedPlaceNames';
import {AUTH_ERROR, BAKERY, CACHED_PLACES, CAFE, SERVER_ERROR, TIMEOUT_ERROR} from './support/savedPlacesFixtures';

jest.mock('../src/entities/info/api', () => ({
  deleteSavedPlaces: jest.fn(),
  getSavedPlaces: jest.fn(),
}));

// 캐시에는 CACHED_PLACES를, 다시 읽은 목록에는 응답 항목 CAFE와 BAKERY를 둡니다. 저장 ID가 같아 같은 장소를 가리킵니다.
const deleteCalls = () => jest.mocked(deleteSavedPlaces).mock.calls;

beforeEach(() => {
  clearSavedPlacesCache();
  writeSavedPlacesCache(CACHED_PLACES, getSavedPlacesCacheGeneration());
  jest.mocked(deleteSavedPlaces).mockReset().mockResolvedValue(undefined);
  // 다시 읽지 않아야 하는 경우에도 목록을 주어, 다시 읽는 변이가 성공으로 끝나 rejects 단언부터 깨지게 합니다.
  jest.mocked(getSavedPlaces).mockReset().mockResolvedValue([BAKERY]);
});

test('지우기에 성공하면 목록을 다시 읽지 않고 그 장소를 캐시에서 뺀다', async () => {
  await expect(deleteSavedPlaceAndRemoveFromCache(CAFE.id)).resolves.toBeUndefined();

  expect(deleteCalls()).toEqual([[[CAFE.id]]]);
  expect(getSavedPlaces).not.toHaveBeenCalled();
  expect(cachedPlaceNames()).toEqual(['빵집']);
});

test('캐시가 비어 있어도 지우면, 지우기 전에 보낸 보관함 조회가 늦게 끝나도 캐시를 채우지 못한다', async () => {
  clearSavedPlacesCache();
  const generationAtRequest = getSavedPlacesCacheGeneration();

  await expect(deleteSavedPlaceAndRemoveFromCache(CAFE.id)).resolves.toBeUndefined();

  writeSavedPlacesCache(CACHED_PLACES, generationAtRequest);
  expect(readSavedPlacesCache()).toBeNull();
});

test('시간 초과로 실패해도 다시 읽은 목록에 없으면 지운 것으로 보고 캐시에서 빼며, 지우기를 다시 보내지는 않는다', async () => {
  jest.mocked(deleteSavedPlaces).mockRejectedValue(TIMEOUT_ERROR);
  jest.mocked(getSavedPlaces).mockResolvedValue([BAKERY]);

  await expect(deleteSavedPlaceAndRemoveFromCache(CAFE.id)).resolves.toBeUndefined();

  expect(deleteCalls()).toEqual([[[CAFE.id]]]);
  expect(getSavedPlaces).toHaveBeenCalledTimes(1);
  expect(cachedPlaceNames()).toEqual(['빵집']);
});

test('시간 초과 뒤 다시 읽은 목록에 장소 ID가 지운 저장 ID와 같은 다른 항목만 있으면 지운 것으로 보고 캐시에서 뺀다', async () => {
  jest.mocked(deleteSavedPlaces).mockRejectedValue(TIMEOUT_ERROR);
  jest.mocked(getSavedPlaces).mockResolvedValue([{...BAKERY, place: {...BAKERY.place, id: CAFE.id}}]);

  await expect(deleteSavedPlaceAndRemoveFromCache(CAFE.id)).resolves.toBeUndefined();

  expect(cachedPlaceNames()).toEqual(['빵집']);
});

test('시간 초과 뒤 다시 읽은 목록에 남아 있으면 처음의 시간 초과 오류를 던지고 캐시를 그대로 둔다', async () => {
  jest.mocked(deleteSavedPlaces).mockRejectedValue(TIMEOUT_ERROR);
  jest.mocked(getSavedPlaces).mockResolvedValue([CAFE, BAKERY]);

  await expect(deleteSavedPlaceAndRemoveFromCache(CAFE.id)).rejects.toEqual(TIMEOUT_ERROR);

  expect(deleteCalls()).toEqual([[[CAFE.id]]]);
  expect(cachedPlaceNames()).toEqual(['카페', '빵집']);
});

test('시간 초과 뒤 다시 읽기도 실패하면 다시 읽기 오류 대신 처음의 시간 초과 오류를 던진다', async () => {
  jest.mocked(deleteSavedPlaces).mockRejectedValue(TIMEOUT_ERROR);
  jest.mocked(getSavedPlaces).mockRejectedValue(SERVER_ERROR);

  await expect(deleteSavedPlaceAndRemoveFromCache(CAFE.id)).rejects.toEqual(TIMEOUT_ERROR);

  expect(cachedPlaceNames()).toEqual(['카페', '빵집']);
});

test('시간 초과 뒤 다시 읽기가 로그인 필요로 실패해도 로그인 오류가 아니라 처음의 시간 초과 오류를 던진다', async () => {
  jest.mocked(deleteSavedPlaces).mockRejectedValue(TIMEOUT_ERROR);
  jest.mocked(getSavedPlaces).mockRejectedValue(AUTH_ERROR);

  await expect(deleteSavedPlaceAndRemoveFromCache(CAFE.id)).rejects.toEqual(TIMEOUT_ERROR);

  expect(cachedPlaceNames()).toEqual(['카페', '빵집']);
});

test('시간 초과가 아닌, 응답을 받지 못한 실패(네트워크 오류)는 목록을 다시 읽지 않고 그 오류를 던진다', async () => {
  jest.mocked(deleteSavedPlaces).mockRejectedValue({...NETWORK_ERROR});

  await expect(deleteSavedPlaceAndRemoveFromCache(CAFE.id)).rejects.toEqual({...NETWORK_ERROR});

  expect(getSavedPlaces).not.toHaveBeenCalled();
  expect(cachedPlaceNames()).toEqual(['카페', '빵집']);
});

test('서버가 오류로 응답한 실패는 목록을 다시 읽지 않고 그 오류를 던진다', async () => {
  jest.mocked(deleteSavedPlaces).mockRejectedValue(SERVER_ERROR);

  await expect(deleteSavedPlaceAndRemoveFromCache(CAFE.id)).rejects.toEqual(SERVER_ERROR);

  expect(getSavedPlaces).not.toHaveBeenCalled();
  expect(cachedPlaceNames()).toEqual(['카페', '빵집']);
});

test('화면 오류 계약 모양이 아닌 실패는 응답 처리 오류로 맞춰 던진다', async () => {
  jest.mocked(deleteSavedPlaces).mockRejectedValue(new Error('boom'));

  await expect(deleteSavedPlaceAndRemoveFromCache(CAFE.id)).rejects.toEqual({...PROCESSING_ERROR});

  expect(getSavedPlaces).not.toHaveBeenCalled();
  expect(cachedPlaceNames()).toEqual(['카페', '빵집']);
});
