import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  clearSavedLibraryCache,
  loadSavedLibraryCache,
  saveCachedSavedPlaces,
  saveCachedSavedPostsFirstPage,
  setSavedLibraryCacheOwner,
  takeStartupCachedPlaces,
  takeStartupCachedPosts,
} from '../src/entities/info/savedLibraryCache';
import type {SavedPlaceListItem} from '../src/entities/info/types';
import type {HistoryReel} from '../src/entities/content/types';

const PLACES = [{savedPlaceId: 'p1'}] as unknown as SavedPlaceListItem[];
const POSTS = {reels: [{id: 'r1'}] as unknown as HistoryReel[], nextCursor: null};

async function flush() {
  await new Promise<void>(resolve => setImmediate(() => resolve()));
}

beforeEach(async () => {
  await clearSavedLibraryCache();
});

test('저장한 보관함을 다음 실행에서 읽어 한 번만 꺼내 준다', async () => {
  setSavedLibraryCacheOwner('member-1');
  saveCachedSavedPlaces(PLACES);
  saveCachedSavedPostsFirstPage(POSTS);
  await flush();

  setSavedLibraryCacheOwner(null); // 앱 재시작 흉내
  await loadSavedLibraryCache('member-1');

  expect(takeStartupCachedPlaces()).toEqual(PLACES);
  expect(takeStartupCachedPosts()).toEqual(POSTS);
  expect(takeStartupCachedPlaces()).toBeNull();
  expect(takeStartupCachedPosts()).toBeNull();
});

test('다른 회원의 캐시는 꺼내지 않는다', async () => {
  setSavedLibraryCacheOwner('member-1');
  saveCachedSavedPlaces(PLACES);
  await flush();

  setSavedLibraryCacheOwner(null);
  await loadSavedLibraryCache('member-2');

  expect(takeStartupCachedPlaces()).toBeNull();
});

test('로그아웃하면 기기에 남은 보관함 캐시를 모두 지운다', async () => {
  setSavedLibraryCacheOwner('member-1');
  saveCachedSavedPlaces(PLACES);
  await flush();

  await clearSavedLibraryCache();
  await loadSavedLibraryCache('member-1');

  expect(takeStartupCachedPlaces()).toBeNull();
  expect((await AsyncStorage.getAllKeys()).some(key => key.includes('saved-library-cache'))).toBe(false);
});

test('7일이 지난 캐시는 쓰지 않는다', async () => {
  const now = Date.now();
  const dateSpy = jest.spyOn(Date, 'now').mockReturnValue(now);
  setSavedLibraryCacheOwner('member-1');
  saveCachedSavedPlaces(PLACES);
  await flush();

  setSavedLibraryCacheOwner(null);
  dateSpy.mockReturnValue(now + 7 * 24 * 60 * 60 * 1000 + 1);
  await loadSavedLibraryCache('member-1');

  expect(takeStartupCachedPlaces()).toBeNull();
  dateSpy.mockRestore();
});
