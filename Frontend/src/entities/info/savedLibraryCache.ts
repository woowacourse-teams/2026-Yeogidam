import AsyncStorage from '@react-native-async-storage/async-storage';

import type { HistoryCursor, HistoryReel } from '../content/types';
import type { SavedPlaceListItem } from './types';

/**
 * 보관함(저장 장소 + 게시물 첫 페이지)의 마지막 응답을 회원별로 기기에 저장한다.
 * 앱을 다시 켜면 스플래시 동안 읽어 두었다가 화면이 먼저 그리고, 서버 응답이 오면 바꾼다.
 */

const KEY_PREFIX = '@yeogidam/saved-library-cache:';
/** 이보다 오래된 캐시는 너무 달라 보일 수 있어 쓰지 않는다. */
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type SavedPostsPage = {
  reels: HistoryReel[];
  nextCursor: HistoryCursor | null;
};

type SavedLibrarySnapshot = {
  places?: { items: SavedPlaceListItem[]; savedAtMs: number };
  posts?: { page: SavedPostsPage; savedAtMs: number };
};

let ownerMemberId: string | null = null;
let snapshot: SavedLibrarySnapshot = {};
let startupPlaces: SavedPlaceListItem[] | null = null;
let startupPosts: SavedPostsPage | null = null;

function keyFor(memberId: string) {
  return `${KEY_PREFIX}${memberId}`;
}

function isFresh(entry: { savedAtMs: number } | undefined, nowMs: number) {
  return entry !== undefined && nowMs - entry.savedAtMs <= CACHE_MAX_AGE_MS;
}

/** 앱 시작 때 세션의 회원으로 캐시를 읽어 둔다. 읽기에 실패하면 캐시 없이 진행한다. */
export async function loadSavedLibraryCache(memberId: string): Promise<void> {
  setSavedLibraryCacheOwner(memberId);
  try {
    const stored = await AsyncStorage.getItem(keyFor(memberId));
    if (!stored || ownerMemberId !== memberId) return;
    const parsed = JSON.parse(stored) as SavedLibrarySnapshot;
    const nowMs = Date.now();
    snapshot = parsed;
    startupPlaces =
      isFresh(parsed.places, nowMs) && Array.isArray(parsed.places?.items)
        ? parsed.places!.items
        : null;
    startupPosts =
      isFresh(parsed.posts, nowMs) && Array.isArray(parsed.posts?.page?.reels)
        ? parsed.posts!.page
        : null;
  } catch {
    startupPlaces = null;
    startupPosts = null;
  }
}

/** 로그인한 회원이 바뀌면 이전 회원의 캐시를 메모리에서 버리고, 이후 저장은 새 회원 키로 한다. */
export function setSavedLibraryCacheOwner(memberId: string | null): void {
  if (ownerMemberId === memberId) return;
  ownerMemberId = memberId;
  snapshot = {};
  startupPlaces = null;
  startupPosts = null;
}

/** 앱 시작 때 읽은 저장 장소 캐시를 한 번만 꺼낸다. */
export function takeStartupCachedPlaces(): SavedPlaceListItem[] | null {
  const items = startupPlaces;
  startupPlaces = null;
  return items;
}

/** 앱 시작 때 읽은 게시물 첫 페이지 캐시를 한 번만 꺼낸다. */
export function takeStartupCachedPosts(): SavedPostsPage | null {
  const page = startupPosts;
  startupPosts = null;
  return page;
}

function persist() {
  const memberId = ownerMemberId;
  if (!memberId) return;
  AsyncStorage.setItem(keyFor(memberId), JSON.stringify(snapshot)).catch(
    () => undefined,
  );
}

export function saveCachedSavedPlaces(items: SavedPlaceListItem[]): void {
  if (!ownerMemberId) return;
  snapshot = { ...snapshot, places: { items, savedAtMs: Date.now() } };
  persist();
}

/** 게시물은 첫 페이지만 저장한다. 다음 페이지는 스크롤할 때 새로 받는다. */
export function saveCachedSavedPostsFirstPage(page: SavedPostsPage): void {
  if (!ownerMemberId) return;
  snapshot = { ...snapshot, posts: { page, savedAtMs: Date.now() } };
  persist();
}

/** 로그아웃·탈퇴 시 기기에 남은 모든 회원의 보관함 캐시를 지운다. */
export async function clearSavedLibraryCache(): Promise<void> {
  setSavedLibraryCacheOwner(null);
  try {
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter(key => key.startsWith(KEY_PREFIX));
    if (cacheKeys.length > 0) await AsyncStorage.removeMany(cacheKeys);
  } catch {
    // 지우지 못해도 다음 로그인 회원 키와 섞이지 않으므로 진행한다.
  }
}
