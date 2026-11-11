import {getSavedPlaces} from './api';
import type {SavedPlaceListItem} from './types';

/** 미리 받은 응답이 이보다 오래되면 버리고 새로 요청한다. */
const SAVED_PLACES_PREFETCH_MAX_AGE_MS = 10_000;

let savedPlacesPrefetch: {
  promise: Promise<SavedPlaceListItem[]>;
  startedAtMs: number;
} | null = null;

/**
 * 앱 시작 때 세션을 확인하자마자 저장 장소를 요청해, 스플래시와 API 대기 시간을 겹친다.
 * 결과는 저장 장소 화면이 첫 로드에서 한 번만 가져간다.
 */
export function prefetchSavedPlaces(): void {
  const promise = Promise.resolve().then(() => getSavedPlaces());
  // 화면이 가져가기 전에 실패해도 처리되지 않은 rejection으로 남지 않게 한다.
  promise.catch(() => undefined);
  savedPlacesPrefetch = {promise, startedAtMs: Date.now()};
}

/** 미리 받아 둔 저장 장소 요청을 한 번만 꺼낸다. 없거나 오래됐으면 null. */
export function takePrefetchedSavedPlaces(): Promise<SavedPlaceListItem[]> | null {
  const prefetch = savedPlacesPrefetch;
  savedPlacesPrefetch = null;
  if (!prefetch || Date.now() - prefetch.startedAtMs > SAVED_PLACES_PREFETCH_MAX_AGE_MS) {
    return null;
  }
  return prefetch.promise;
}

/** 로그아웃·회원 변경 시 이전 회원의 응답이 쓰이지 않게 버린다. */
export function clearPrefetchedSavedPlaces(): void {
  savedPlacesPrefetch = null;
}
