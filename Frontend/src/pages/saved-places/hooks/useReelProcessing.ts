import {useEffect, useMemo, useReducer} from 'react';

import type {ReelProcessingStatus, SaveInstagramReelResponse} from '../../../entities/content/types';
import type {SavedPlacesApiError} from '../../../entities/info/types';
import type {Place} from '../../../entities/place/types';
import {INITIAL_REEL_PROCESSING_STATE, reelProcessingReducer} from '../reelProcessing';
import {useExternalShareResults} from './useExternalShareResults';
import {useReelStatusPolling} from './useReelStatusPolling';

const SAVE_SUCCESS_VISIBLE_MS = 1800;

type Options = {
  isGuest: boolean;
  loadSavedPlaces: () => Promise<Place[] | null>;
  onSharedResultConsumed?: (requestId?: string) => Promise<void>;
  onRequireLogin?: () => void;
  /** 보관함 목록 오류입니다. 폴링 구독이 의존성으로만 씁니다. */
  listError: SavedPlacesApiError | null;
};

/**
 * 링크 저장이나 외부 공유로 생긴 처리 중 릴스를 끝날 때까지 지켜봅니다.
 * 상태 전환은 reelProcessingReducer가 맡고, 공유 상태 구독(useExternalShareResults), 공용 목록 폴링(useReelStatusPolling),
 * 링크 저장 완료 뒤 보관함 다시 읽기를 이 순서로 돌립니다. 링크 저장이 알려 줄 동작 셋을 돌려줍니다.
 */
export function useReelProcessing({
  isGuest,
  loadSavedPlaces,
  onSharedResultConsumed,
  onRequireLogin,
  listError,
}: Options) {
  const [state, dispatch] = useReducer(reelProcessingReducer, INITIAL_REEL_PROCESSING_STATE);

  useExternalShareResults({
    enabled: !isGuest,
    loadSavedPlaces,
    onSharedResultConsumed,
    dispatch,
  });
  useReelStatusPolling({
    processingReelId: state.processingReelId,
    processingReel: state.processingReel,
    dispatch,
    onRequireLogin,
    listError,
  });

  useEffect(() => {
    if (!state.showSaveSuccess) {
      return;
    }

    // 저장 API의 즉시 완료 응답, 상태 폴링 완료, 공유 상태 복원 중 어느
    // 경로로 완료되더라도 최신 저장 장소를 보관함에 바로 반영합니다.
    loadSavedPlaces().catch(() => undefined);

    const timeoutId = setTimeout(
      () => dispatch({type: 'saveSuccessHidden'}),
      SAVE_SUCCESS_VISIBLE_MS,
    );
    return () => clearTimeout(timeoutId);
  }, [loadSavedPlaces, state.showSaveSuccess]);

  return useMemo(
    () => ({
      /** 링크 저장을 시작했습니다. 이전 릴스를 잊고 새 릴스를 둡니다. */
      startLinkSave: (reel: ReelProcessingStatus) => dispatch({type: 'linkSaveStarted', reel}),
      /** 링크 저장 API가 응답했습니다. 처리 중이면 응답한 릴스를 폴링합니다. */
      finishLinkSave: (response: SaveInstagramReelResponse) =>
        dispatch({type: 'linkSaveResponded', response, createdAt: new Date().toISOString()}),
      /** 링크 저장 API가 실패했습니다. */
      failLinkSave: (reel: ReelProcessingStatus) => dispatch({type: 'linkSaveFailed', reel}),
    }),
    [],
  );
}
