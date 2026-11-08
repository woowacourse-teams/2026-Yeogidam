import {AppState, type AppStateStatus} from 'react-native';

import {getHistoryReels} from './history-api';
import type {HistoryCursor, HistoryReel} from './types';

export type RecentSharesSnapshot = {
  reels: HistoryReel[];
  nextCursor: HistoryCursor | null;
};

type Subscriber = {
  intervalMs: number;
  onResult: (snapshot: RecentSharesSnapshot) => void;
  onError?: (error: unknown) => void;
};

export type RecentSharesSubscription = {
  /** 바로 한 번 읽고 결과를 모든 구독자에게 나눠 줍니다. 읽는 중이면 그 요청을 함께 씁니다. */
  refresh: () => Promise<RecentSharesSnapshot>;
  unsubscribe: () => void;
};

const subscribers = new Set<Subscriber>();
let timer: ReturnType<typeof setTimeout> | null = null;
let inFlight: Promise<RecentSharesSnapshot> | null = null;
/** 예약된 차례의 요청이 진행 중이면 끝난 뒤 schedule()이 다음 차례를 잡습니다. */
let isScheduledFetchRunning = false;
let appStateSubscription: {remove: () => void} | null = null;
/** 마지막으로 받은 목록입니다. 화면이 다시 마운트돼도 다음 폴링 전까지 이 값을 보여 줍니다. */
let lastSnapshot: RecentSharesSnapshot | null = null;
/** 캐시를 비울 때 올려, 비우기 전에 보낸 요청의 응답이 캐시를 되살리지 못하게 합니다. */
let cacheGeneration = 0;

/** 마지막으로 받은 공유 목록입니다. 아직 받은 적이 없거나 비워졌으면 null입니다. */
export function getRecentSharesSnapshot(): RecentSharesSnapshot | null {
  return lastSnapshot;
}

/** 로그아웃·탈퇴·계정 변경 때 호출해 이전 계정의 목록이 남지 않게 합니다. */
export function clearRecentShares() {
  lastSnapshot = null;
  cacheGeneration += 1;
  inFlight = null;
}

function currentIntervalMs(): number | null {
  let interval: number | null = null;
  subscribers.forEach(subscriber => {
    interval = interval === null ? subscriber.intervalMs : Math.min(interval, subscriber.intervalMs);
  });
  return interval;
}

function fetchRecentShares(): Promise<RecentSharesSnapshot> {
  if (inFlight) return inFlight;

  const generation = cacheGeneration;
  const request = getHistoryReels().then(
    snapshot => {
      if (generation !== cacheGeneration) return snapshot;
      lastSnapshot = snapshot;
      subscribers.forEach(subscriber => subscriber.onResult(snapshot));
      return snapshot;
    },
    error => {
      subscribers.forEach(subscriber => subscriber.onError?.(error));
      throw error;
    },
  );
  inFlight = request;
  request
    .finally(() => {
      if (inFlight === request) inFlight = null;
    })
    .catch(() => undefined);
  return request;
}

/** 앞 요청이 끝난 뒤 다음 요청을 예약해 응답이 느려도 요청이 겹치지 않게 합니다. */
function schedule() {
  if (timer) clearTimeout(timer);
  timer = null;
  const interval = currentIntervalMs();
  if (interval === null) return;

  timer = setTimeout(() => {
    timer = null;
    // 백그라운드에서는 읽지 않고, 포그라운드로 돌아올 때 바로 읽습니다.
    if (AppState.currentState === 'background') {
      schedule();
      return;
    }
    isScheduledFetchRunning = true;
    fetchRecentShares()
      .catch(() => undefined)
      .finally(() => {
        isScheduledFetchRunning = false;
        schedule();
      });
  }, interval);
}

/** 구독자가 바뀌면 바뀐 주기로 다시 예약합니다. */
function reschedule() {
  if (!isScheduledFetchRunning) schedule();
}

function handleAppStateChange(state: AppStateStatus) {
  if (state !== 'active' || subscribers.size === 0) return;
  fetchRecentShares().catch(() => undefined);
  reschedule();
}

/**
 * 공유 목록 첫 페이지(GET /api/v1/shares)를 앱 전체에서 한 번만 폴링합니다.
 * 주기는 구독자가 원하는 값 중 가장 짧은 값이고, 구독자가 없으면 멈춥니다.
 */
export function subscribeRecentShares(
  subscriber: Subscriber,
): RecentSharesSubscription {
  const entry = {...subscriber};
  subscribers.add(entry);
  if (!appStateSubscription) {
    appStateSubscription = AppState.addEventListener('change', handleAppStateChange);
  }
  reschedule();

  return {
    refresh: () => fetchRecentShares(),
    unsubscribe: () => {
      if (!subscribers.delete(entry)) return;
      if (subscribers.size === 0) {
        appStateSubscription?.remove();
        appStateSubscription = null;
      }
      reschedule();
    },
  };
}
