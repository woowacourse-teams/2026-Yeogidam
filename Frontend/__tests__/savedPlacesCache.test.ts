import {
  clearSavedPlacesCache,
  getSavedPlacesCacheGeneration,
  readSavedPlacesCache,
  removeFromSavedPlacesCache,
  wasSavedPlacesCacheClearedSince,
  writeSavedPlacesCache,
} from '../src/entities/info/saved-places-cache';
import type {Place} from '../src/entities/place/types';
import {cachedPlaceNames} from './support/cachedPlaceNames';
import {CACHED_BAKERY, CACHED_CAFE, CACHED_PLACES} from './support/savedPlacesFixtures';

const isBakery = (cached: Place) => cached.savedPlaceId === CACHED_BAKERY.savedPlaceId;

beforeEach(() => {
  clearSavedPlacesCache();
});

test('처음에는 비어 있고, 조회를 시작할 때의 세대로 쓰면 채워진다', () => {
  expect(readSavedPlacesCache()).toBeNull();
  const generation = getSavedPlacesCacheGeneration();
  writeSavedPlacesCache([CACHED_CAFE], generation);
  expect(cachedPlaceNames()).toEqual(['카페']);
});

test('채워진 캐시도 지금 세대로 쓰면 새 목록으로 바뀐다', () => {
  writeSavedPlacesCache(CACHED_PLACES, getSavedPlacesCacheGeneration());
  writeSavedPlacesCache([CACHED_CAFE], getSavedPlacesCacheGeneration());
  expect(cachedPlaceNames()).toEqual(['카페']);
});

test('비운 뒤에 끝난 조회는 비우기 전의 세대라서 캐시를 다시 채우지 않는다', () => {
  const generationBeforeClear = getSavedPlacesCacheGeneration();
  clearSavedPlacesCache();
  writeSavedPlacesCache([CACHED_CAFE], generationBeforeClear);
  expect(readSavedPlacesCache()).toBeNull();
});

test('지운 장소를 빼면 나머지만 남는다', () => {
  writeSavedPlacesCache(CACHED_PLACES, getSavedPlacesCacheGeneration());
  removeFromSavedPlacesCache(isBakery);
  expect(cachedPlaceNames()).toEqual(['카페']);
});

test('비어 있을 때 빼면 빈 목록이 되지 않고 그대로 비어 있다', () => {
  removeFromSavedPlacesCache(isBakery);
  expect(readSavedPlacesCache()).toBeNull();
});

test('비어 있을 때 빼도 빼기 전에 보낸 조회가 캐시를 채우지 못한다', () => {
  const generationBeforeRemove = getSavedPlacesCacheGeneration();
  removeFromSavedPlacesCache(isBakery);

  writeSavedPlacesCache(CACHED_PLACES, generationBeforeRemove);
  expect(readSavedPlacesCache()).toBeNull();
});

test('비운 뒤에 빼도 비우기 전에 보낸 조회가 캐시를 채우지 못한다', () => {
  const generationBeforeClear = getSavedPlacesCacheGeneration();
  writeSavedPlacesCache(CACHED_PLACES, generationBeforeClear);
  clearSavedPlacesCache();
  removeFromSavedPlacesCache(isBakery);

  // 세션이 끝나기 전에 보낸 조회가 지운 뒤에야 끝난 경우다. 빼기가 세대를 내리면 이전 회원의 목록이 들어간다.
  writeSavedPlacesCache(CACHED_PLACES, generationBeforeClear);
  expect(readSavedPlacesCache()).toBeNull();
});

test('지우기 전에 보낸 조회가 지운 뒤에 끝나면 지운 장소를 다시 써 넣지 않는다', () => {
  const generationBeforeDelete = getSavedPlacesCacheGeneration();
  writeSavedPlacesCache(CACHED_PLACES, generationBeforeDelete);
  removeFromSavedPlacesCache(isBakery);

  // 지우기 전에 시작한 조회의 결과에는 지운 장소가 들어 있다.
  writeSavedPlacesCache(CACHED_PLACES, generationBeforeDelete);
  expect(cachedPlaceNames()).toEqual(['카페']);
});

test('비우면 그 전에 시작한 조회에 비웠다고 알리고, 비운 뒤에 시작한 조회에는 알리지 않는다', () => {
  const generationBeforeClear = getSavedPlacesCacheGeneration();
  expect(wasSavedPlacesCacheClearedSince(generationBeforeClear)).toBe(false);

  clearSavedPlacesCache();
  expect(wasSavedPlacesCacheClearedSince(generationBeforeClear)).toBe(true);
  expect(wasSavedPlacesCacheClearedSince(getSavedPlacesCacheGeneration())).toBe(false);
});

test('장소를 빼기만 하면 세대는 올라도 비웠다고 알리지 않는다', () => {
  writeSavedPlacesCache(CACHED_PLACES, getSavedPlacesCacheGeneration());
  const generationBeforeRemove = getSavedPlacesCacheGeneration();

  removeFromSavedPlacesCache(isBakery);
  expect(getSavedPlacesCacheGeneration()).toBe(generationBeforeRemove + 1);
  expect(wasSavedPlacesCacheClearedSince(generationBeforeRemove)).toBe(false);
});
