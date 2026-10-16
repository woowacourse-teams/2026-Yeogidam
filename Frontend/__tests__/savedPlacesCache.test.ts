import {
  clearSavedPlacesCache,
  getSavedPlacesCacheGeneration,
  readSavedPlacesCache,
  removeFromSavedPlacesCache,
  writeSavedPlacesCache,
} from '../src/entities/info/saved-places-cache';
import type {Place} from '../src/entities/place/types';

const place = (name: string, savedPlaceId: string): Place =>
  ({id: `place-${savedPlaceId}`, name, savedPlaceId} as Place);

beforeEach(() => {
  clearSavedPlacesCache();
});

test('처음에는 비어 있고, 조회를 시작할 때의 세대로 쓰면 채워진다', () => {
  expect(readSavedPlacesCache()).toBeNull();
  const generation = getSavedPlacesCacheGeneration();
  writeSavedPlacesCache([place('카페', 'sp-1')], generation);
  expect(readSavedPlacesCache()?.map(cached => cached.name)).toEqual(['카페']);
});

test('비운 뒤에 끝난 조회는 비우기 전의 세대라서 캐시를 다시 채우지 않는다', () => {
  const generationBeforeClear = getSavedPlacesCacheGeneration();
  clearSavedPlacesCache();
  writeSavedPlacesCache([place('카페', 'sp-1')], generationBeforeClear);
  expect(readSavedPlacesCache()).toBeNull();

  writeSavedPlacesCache([place('빵집', 'sp-2')], getSavedPlacesCacheGeneration());
  expect(readSavedPlacesCache()?.map(cached => cached.name)).toEqual(['빵집']);
});

test('지운 장소를 빼면 나머지만 남고, 비어 있을 때 빼면 그대로 비어 있다', () => {
  removeFromSavedPlacesCache(cached => cached.savedPlaceId === 'sp-1');
  expect(readSavedPlacesCache()).toBeNull();

  const generation = getSavedPlacesCacheGeneration();
  writeSavedPlacesCache([place('카페', 'sp-1'), place('빵집', 'sp-2')], generation);
  removeFromSavedPlacesCache(cached => cached.savedPlaceId === 'sp-1');
  expect(readSavedPlacesCache()?.map(cached => cached.name)).toEqual(['빵집']);
  // 빼기는 비우기가 아니므로 세대를 올리지 않는다.
  expect(getSavedPlacesCacheGeneration()).toBe(generation);
});
