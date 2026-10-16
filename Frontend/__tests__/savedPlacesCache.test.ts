import {
  clearSavedPlacesCache,
  getSavedPlacesCacheGeneration,
  readSavedPlacesCache,
  removeFromSavedPlacesCache,
  writeSavedPlacesCache,
} from '../src/entities/info/saved-places-cache';
import {place} from './support/savedPlacesFixtures';

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

test('지운 장소를 빼면 나머지만 남고, 비어 있을 때 빼도 세대를 올려 빼기 전에 보낸 조회가 캐시를 채우지 못한다', () => {
  const generationBeforeRemove = getSavedPlacesCacheGeneration();
  removeFromSavedPlacesCache(cached => cached.savedPlaceId === 'sp-1');
  expect(readSavedPlacesCache()).toBeNull();
  writeSavedPlacesCache([place('카페', 'sp-1')], generationBeforeRemove);
  expect(readSavedPlacesCache()).toBeNull();

  writeSavedPlacesCache([place('카페', 'sp-1'), place('빵집', 'sp-2')], getSavedPlacesCacheGeneration());
  removeFromSavedPlacesCache(cached => cached.savedPlaceId === 'sp-1');
  expect(readSavedPlacesCache()?.map(cached => cached.name)).toEqual(['빵집']);
});

test('지우기 전에 보낸 조회가 지운 뒤에 끝나면 지운 장소를 다시 써 넣지 않는다', () => {
  const generationBeforeDelete = getSavedPlacesCacheGeneration();
  writeSavedPlacesCache([place('카페', 'sp-1'), place('빵집', 'sp-2')], generationBeforeDelete);
  removeFromSavedPlacesCache(cached => cached.savedPlaceId === 'sp-1');

  // 지우기 전에 시작한 조회의 결과에는 지운 장소가 들어 있다.
  writeSavedPlacesCache([place('카페', 'sp-1'), place('빵집', 'sp-2')], generationBeforeDelete);
  expect(readSavedPlacesCache()?.map(cached => cached.name)).toEqual(['빵집']);

  writeSavedPlacesCache([place('빵집', 'sp-2')], getSavedPlacesCacheGeneration());
  expect(readSavedPlacesCache()?.map(cached => cached.name)).toEqual(['빵집']);
});
