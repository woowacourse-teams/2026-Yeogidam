import {
  clearSavedPlacesCache,
  getSavedPlacesCacheGeneration,
  readSavedPlacesCache,
  removeFromSavedPlacesCache,
  writeSavedPlacesCache,
} from '../src/entities/info/saved-places-cache';
import type {Place} from '../src/entities/place/types';
import {CACHED_BAKERY, CACHED_CAFE, CACHED_PLACES} from './support/savedPlacesFixtures';

const cachedNames = () => readSavedPlacesCache()?.map(cached => cached.name);
const isCafe = (cached: Place) => cached.savedPlaceId === CACHED_CAFE.savedPlaceId;

beforeEach(() => {
  clearSavedPlacesCache();
});

test('처음에는 비어 있고, 조회를 시작할 때의 세대로 쓰면 채워진다', () => {
  expect(readSavedPlacesCache()).toBeNull();
  const generation = getSavedPlacesCacheGeneration();
  writeSavedPlacesCache([CACHED_CAFE], generation);
  expect(cachedNames()).toEqual(['카페']);
});

test('비운 뒤에 끝난 조회는 비우기 전의 세대라서 캐시를 다시 채우지 않는다', () => {
  const generationBeforeClear = getSavedPlacesCacheGeneration();
  clearSavedPlacesCache();
  writeSavedPlacesCache([CACHED_CAFE], generationBeforeClear);
  expect(readSavedPlacesCache()).toBeNull();

  writeSavedPlacesCache([CACHED_BAKERY], getSavedPlacesCacheGeneration());
  expect(cachedNames()).toEqual(['빵집']);
});

test('지운 장소를 빼면 나머지만 남는다', () => {
  writeSavedPlacesCache(CACHED_PLACES, getSavedPlacesCacheGeneration());
  removeFromSavedPlacesCache(isCafe);
  expect(cachedNames()).toEqual(['빵집']);
});

test('비어 있을 때 빼도 빼기 전에 보낸 조회가 캐시를 채우지 못한다', () => {
  const generationBeforeRemove = getSavedPlacesCacheGeneration();
  removeFromSavedPlacesCache(isCafe);
  expect(readSavedPlacesCache()).toBeNull();

  writeSavedPlacesCache(CACHED_PLACES, generationBeforeRemove);
  expect(readSavedPlacesCache()).toBeNull();
});

test('비운 뒤에 빼도 비우기 전에 보낸 조회가 캐시를 채우지 못한다', () => {
  const generationBeforeClear = getSavedPlacesCacheGeneration();
  writeSavedPlacesCache(CACHED_PLACES, generationBeforeClear);
  clearSavedPlacesCache();
  removeFromSavedPlacesCache(isCafe);

  // 세션이 끝나기 전에 보낸 조회가 지운 뒤에야 끝난 경우다. 빼기가 세대를 내리면 이전 회원의 목록이 들어간다.
  writeSavedPlacesCache(CACHED_PLACES, generationBeforeClear);
  expect(readSavedPlacesCache()).toBeNull();
});

test('지우기 전에 보낸 조회가 지운 뒤에 끝나면 지운 장소를 다시 써 넣지 않는다', () => {
  const generationBeforeDelete = getSavedPlacesCacheGeneration();
  writeSavedPlacesCache(CACHED_PLACES, generationBeforeDelete);
  removeFromSavedPlacesCache(isCafe);

  // 지우기 전에 시작한 조회의 결과에는 지운 장소가 들어 있다.
  writeSavedPlacesCache(CACHED_PLACES, generationBeforeDelete);
  expect(cachedNames()).toEqual(['빵집']);

  writeSavedPlacesCache([CACHED_BAKERY], getSavedPlacesCacheGeneration());
  expect(cachedNames()).toEqual(['빵집']);
});
