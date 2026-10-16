import {useCallback, useEffect, useRef} from 'react';

import type {AnalyticsClient} from '../../analytics/analytics';
import {
  trackHistoryContentViewed,
  type HistoryVisibleState,
} from '../../analytics/placeExtractionEvents';
import type {HistoryReel} from '../../entities/content/types';
import {getHistoryVisibleState, isCardHalfVisible} from './history-format';

/** 날짜 묶음 안에서 잰 카드 위치와 높이입니다. */
export type HistoryCardLayout = {group: string; y: number; height: number};

/**
 * 히스토리 카드가 절반 이상 0.5초 동안 보이면 카드 상태마다 한 번씩 노출 지표를 남깁니다.
 * 카드 위치는 날짜 묶음 안의 위치로 받아 묶음 위치와 더해 판단합니다. 상세가 열려 있는 동안에는
 * 판단하지 않고 기다리던 판단도 취소하며, 목록으로 돌아오면 기억한 배치로 다시 판단합니다.
 *
 * @param paused 상세가 열려 있어 목록이 보이지 않는지입니다.
 * @param scrollOffsetRef 목록의 지금 스크롤 위치입니다. 스크롤 복원 훅이 기억하는 값을 같이 읽습니다.
 */
export function useHistoryCardImpressions({
  posthog,
  reels,
  paused,
  scrollOffsetRef,
}: {
  posthog: AnalyticsClient | null | undefined;
  reels: HistoryReel[];
  paused: boolean;
  scrollOffsetRef: {readonly current: number};
}) {
  const viewportHeightRef = useRef(0);
  const groupOffsetsRef = useRef(new Map<string, number>());
  const cardLayoutsRef = useRef(new Map<string, HistoryCardLayout>());
  const seenCardsRef = useRef(new Set<string>());
  const visibleTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const cardStatesRef = useRef(new Map<string, HistoryVisibleState>());

  cardStatesRef.current = new Map(reels.map(reel => [reel.id, getHistoryVisibleState(reel)]));

  const evaluateVisibleCards = useCallback(() => {
    if (paused) return;
    /** 카드가 지금 목록 화면에 절반 이상 보이는지입니다. 날짜 묶음 위치를 아직 모르면 null입니다. */
    const isHalfVisibleNow = (layout: HistoryCardLayout) => {
      const groupY = groupOffsetsRef.current.get(layout.group);
      if (groupY === undefined) return null;
      const viewportTop = scrollOffsetRef.current;
      return isCardHalfVisible(
        {top: groupY + layout.y, height: layout.height},
        {top: viewportTop, bottom: viewportTop + viewportHeightRef.current},
      );
    };

    for (const [contentId, layout] of cardLayoutsRef.current) {
      const state = cardStatesRef.current.get(contentId);
      const halfVisible = isHalfVisibleNow(layout);
      if (!state || halfVisible === null || viewportHeightRef.current === 0) continue;
      const key = `${contentId}.${state}`;
      if (!halfVisible || seenCardsRef.current.has(key)) {
        // 보이지 않거나 이미 남긴 카드는 기다리던 판단을 취소한다.
        const timer = visibleTimersRef.current.get(key);
        if (timer) clearTimeout(timer);
        visibleTimersRef.current.delete(key);
        continue;
      }
      if (visibleTimersRef.current.has(key)) continue;
      const timer = setTimeout(() => {
        visibleTimersRef.current.delete(key);
        const latest = cardLayoutsRef.current.get(contentId);
        if (!latest || cardStatesRef.current.get(contentId) !== state) return;
        if (isHalfVisibleNow(latest) && !seenCardsRef.current.has(key)) {
          seenCardsRef.current.add(key);
          trackHistoryContentViewed(posthog, contentId, state);
        }
      }, 500);
      visibleTimersRef.current.set(key, timer);
    }
  }, [paused, posthog, scrollOffsetRef]);

  useEffect(() => {
    evaluateVisibleCards();
  }, [evaluateVisibleCards, reels]);

  useEffect(() => () => {
    visibleTimersRef.current.forEach(clearTimeout);
    visibleTimersRef.current.clear();
  }, []);

  useEffect(() => {
    if (paused) {
      visibleTimersRef.current.forEach(clearTimeout);
      visibleTimersRef.current.clear();
    }
  }, [paused]);

  /** 목록 ScrollView의 높이를 받아 다시 판단합니다. */
  const onViewportLayout = useCallback((height: number) => {
    viewportHeightRef.current = height;
    evaluateVisibleCards();
  }, [evaluateVisibleCards]);

  /** 날짜 묶음의 목록 안 위치를 받아 다시 판단합니다. */
  const onGroupLayout = useCallback((date: string, y: number) => {
    groupOffsetsRef.current.set(date, y);
    evaluateVisibleCards();
  }, [evaluateVisibleCards]);

  /** 카드의 날짜 묶음 안 위치와 높이를 받아 다시 판단합니다. */
  const onCardLayout = useCallback((reelId: string, layout: HistoryCardLayout) => {
    cardLayoutsRef.current.set(reelId, layout);
    evaluateVisibleCards();
  }, [evaluateVisibleCards]);

  return {evaluateVisibleCards, onViewportLayout, onGroupLayout, onCardLayout};
}
