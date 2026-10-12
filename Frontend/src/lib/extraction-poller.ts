import { AppState } from 'react-native';

import { getHistoryReels } from '../entities/content/api';
import type { ExtractionStatus, HistoryReel } from '../entities/content/types';
import { ApiError } from './api/errors';

/** 분석 중인 항목이 있을 때 히스토리 첫 페이지를 다시 읽는 간격입니다. */
const POLL_INTERVAL_MS = 3000;

/** EXTRACTING에서 SUCCEEDED나 FAILED로 바뀐 공유 이력입니다. */
export type FinishedExtraction = {
  sharedMediaId: string;
  extractionStatus: Exclude<ExtractionStatus, 'EXTRACTING'>;
};

/** 분석이 끝난 항목이 있거나 분석 중인 항목 수가 바뀌면 구독자에게 보내는 알림입니다. */
export type ExtractionPollerEvent = {
  finished: FinishedExtraction[];
  extractingCount: number;
};

export type ExtractionPollerState = {
  /** AppState가 active인지입니다. */
  isActive: boolean;
  /** 분석 중인 공유 이력 id입니다. 등록한 id와 첫 페이지에서 본 EXTRACTING 항목을 함께 둡니다. */
  extractingIds: string[];
};

export type ExtractionPollerAction =
  | { type: 'registered'; sharedMediaIds: string[] }
  | { type: 'appStateChanged'; isActive: boolean }
  | {
      type: 'firstPageFetched';
      reels: HistoryReel[];
      /** 첫 페이지를 요청할 때 분석 중이던 id입니다. */
      requestedIds: string[];
    }
  | { type: 'reset' };

/**
 * 폴러 상태를 바꾸고 이번에 분석이 끝난 항목을 돌려줍니다.
 * 첫 페이지를 읽으면 분석 중인 id를 응답의 EXTRACTING 항목으로 바꿉니다. 요청 뒤에 등록한 id는
 * 응답에 아직 없을 수 있어 남기고, 요청 때 이미 있던 id가 첫 페이지에 없으면 더 따라갈 수 없어 버립니다.
 */
export function reduceExtractionPoller(
  state: ExtractionPollerState,
  action: ExtractionPollerAction,
): { state: ExtractionPollerState; finished: FinishedExtraction[] } {
  switch (action.type) {
    case 'registered': {
      const newIds = action.sharedMediaIds.filter(
        (sharedMediaId, index) =>
          !state.extractingIds.includes(sharedMediaId) &&
          action.sharedMediaIds.indexOf(sharedMediaId) === index,
      );

      return {
        state: newIds.length
          ? { ...state, extractingIds: [...state.extractingIds, ...newIds] }
          : state,
        finished: [],
      };
    }
    case 'appStateChanged':
      return { state: { ...state, isActive: action.isActive }, finished: [] };
    case 'firstPageFetched': {
      const statuses = new Map(
        action.reels.map(reel => [reel.sharedMediaId, reel.extractionStatus]),
      );
      const finished: FinishedExtraction[] = [];
      state.extractingIds.forEach(sharedMediaId => {
        const status = statuses.get(sharedMediaId);
        if (status === 'SUCCEEDED' || status === 'FAILED') {
          finished.push({ sharedMediaId, extractionStatus: status });
        }
      });
      const registeredDuringRequest = state.extractingIds.filter(
        sharedMediaId =>
          !statuses.has(sharedMediaId) &&
          !action.requestedIds.includes(sharedMediaId),
      );

      return {
        state: {
          ...state,
          extractingIds: [
            ...action.reels
              .filter(reel => reel.extractionStatus === 'EXTRACTING')
              .map(reel => reel.sharedMediaId),
            ...registeredDuringRequest,
          ],
        },
        finished,
      };
    }
    case 'reset':
      return { state: { ...state, extractingIds: [] }, finished: [] };
  }
}

/** 앱이 앞에 있고 분석 중인 항목이 하나라도 있을 때만 폴링합니다. */
export function shouldPoll(state: ExtractionPollerState): boolean {
  return state.isActive && state.extractingIds.length > 0;
}

let state: ExtractionPollerState = { isActive: false, extractingIds: [] };
let timer: ReturnType<typeof setTimeout> | null = null;
let isFetching = false;
let isWatchingAppState = false;
const listeners = new Set<(event: ExtractionPollerEvent) => void>();

function syncTimer() {
  if (!shouldPoll(state)) {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    return;
  }

  // 요청 중이면 요청이 끝난 뒤 다시 맞추므로 요청이 겹치지 않습니다.
  if (!timer && !isFetching) {
    timer = setTimeout(pollFirstPage, POLL_INTERVAL_MS);
  }
}

function dispatch(action: ExtractionPollerAction) {
  const previousCount = state.extractingIds.length;
  const result = reduceExtractionPoller(state, action);
  state = result.state;
  syncTimer();

  const extractingCount = state.extractingIds.length;
  if (result.finished.length > 0 || extractingCount !== previousCount) {
    const event = { finished: result.finished, extractingCount };
    listeners.forEach(listener => listener(event));
  }
}

async function pollFirstPage() {
  timer = null;
  isFetching = true;
  const requestedIds = state.extractingIds;

  try {
    const { reels } = await getHistoryReels();
    dispatch({ type: 'firstPageFetched', reels, requestedIds });
  } catch (error) {
    // 401은 세션이 끝났다는 뜻이라 따라가던 항목을 버리고 멈춥니다. 나머지 실패는 다음 주기에 다시 읽습니다.
    if (error instanceof ApiError && error.status === 401) {
      dispatch({ type: 'reset' });
    }
  } finally {
    isFetching = false;
    syncTimer();
  }
}

/** 분석 중인 공유 이력을 맡깁니다. 여러 id를 한 번에 넘기면 알림도 한 번만 갑니다. */
export function registerExtraction(...sharedMediaIds: string[]): void {
  if (sharedMediaIds.length === 0) {
    return;
  }

  // 처음 등록하기 전에는 폴링할 일이 없어 AppState 구독을 미루고, 한 번 만든 구독은 앱이 끝날 때까지 둡니다.
  if (!isWatchingAppState) {
    isWatchingAppState = true;
    dispatch({
      type: 'appStateChanged',
      isActive: AppState.currentState === 'active',
    });
    AppState.addEventListener('change', nextState => {
      dispatch({ type: 'appStateChanged', isActive: nextState === 'active' });
    });
  }

  dispatch({ type: 'registered', sharedMediaIds });
}

/** 구독을 끊는 함수를 돌려줍니다. 구독할 때 바로 부르지는 않습니다. */
export function subscribeExtractionPoller(
  listener: (event: ExtractionPollerEvent) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 지금 분석 중인 항목 수입니다. 구독 전에 처음 값을 그릴 때 씁니다. */
export function getExtractingCount(): number {
  return state.extractingIds.length;
}
