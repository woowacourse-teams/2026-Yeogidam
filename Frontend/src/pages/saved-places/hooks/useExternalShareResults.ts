import {useEffect, type Dispatch} from 'react';

import {getReelProcessingStatus} from '../../../entities/content/api';
import {normalizeReelError} from '../../../entities/content/errors';
import type {ReelProcessingStatus} from '../../../entities/content/types';
import type {Place} from '../../../entities/place/types';
import {
  getSharedSaveState,
  setSharedSaveState,
  subscribeSharedSaveState,
  type SharedSaveState,
} from '../../../lib/reel-save-state';
import {
  classifySharedSaveState,
  isSameSharedSave,
  toVerificationKey,
  type ReelProcessingAction,
} from '../reelProcessing';

type Options = {
  /** 꺼져 있으면(비회원) 공유 상태를 구독하지 않습니다. */
  enabled: boolean;
  /** 보관함 목록을 다시 읽습니다. 반영하지 못했으면 null이고(경우는 useSavedPlacesList의 readSavedPlaces 설명에), 그러면 공유 결과를 소비하지 않습니다. */
  loadSavedPlaces: () => Promise<Place[] | null>;
  /** 외부 공유 결과를 다 보여 준 뒤 네이티브에 남은 결과를 지웁니다. */
  onSharedResultConsumed?: (requestId?: string) => Promise<void>;
  dispatch: Dispatch<ReelProcessingAction>;
};

/**
 * 공유 저장 상태(reel-save-state)를 구독해 처리 중 릴스 상태에 반영합니다.
 * 앱 진입 때 받은 외부 공유는 서버 상태를 한 번 확인한 뒤에 보여 주고, 외부 공유가 완료되면
 * 보관함을 두 번 읽은 다음 공유 결과를 소비합니다. 링크 저장도 같은 공유 상태를 쓰므로 완료된 상태는 여기서 비웁니다.
 */
export function useExternalShareResults({
  enabled,
  loadSavedPlaces,
  onSharedResultConsumed,
  dispatch,
}: Options) {
  useEffect(() => {
    if (!enabled) {
      return;
    }
    let isActive = true;
    const verifiedKeys = new Set<string>();
    const verificationInFlight = new Set<string>();

    const verifySharedReelBeforeShowing = async (
      state: SharedSaveState,
      verificationKey: string,
    ) => {
      verificationInFlight.add(verificationKey);
      try {
        // 토큰 갱신과 401 재시도는 Spring API 클라이언트가 처리합니다.
        let currentStatus: ReelProcessingStatus | null;
        try {
          currentStatus = await getReelProcessingStatus(state.reel.id);
        } catch (statusError) {
          throw normalizeReelError(statusError);
        }

        if (!isActive) {
          return;
        }
        // 확인하는 사이 링크 저장이나 다른 공유가 공유 상태를 바꿨으면 늦게 온 확인 결과를 버립니다.
        // 보여 주지 않은 외부 공유는 소비하지 않으므로, 네이티브에 남은 결과를 다음 실행 때 다시 확인합니다.
        const latestState = getSharedSaveState();
        if (!latestState || !isSameSharedSave(latestState, state)) {
          return;
        }
        if (!currentStatus) {
          if (__DEV__) {
            console.warn('[InstagramShare][status-response]', {
              requestId: state.shareResultId ?? null,
              reelId: state.reel.id,
              result: null,
            });
          }
          setSharedSaveState(null);
          await onSharedResultConsumed?.(state.shareResultId);
          return;
        }

        verifiedKeys.add(verificationKey);
        verifiedKeys.add(toVerificationKey(currentStatus));
        if (__DEV__) {
          console.info('[InstagramShare][status-response]', {
            requestId: state.shareResultId ?? null,
            reelId: currentStatus.id,
            status: currentStatus.processing_status,
            failureReason: currentStatus.failure_reason,
          });
        }
        setSharedSaveState({
          ...latestState,
          status: currentStatus.processing_status,
          reel: currentStatus,
        });
      } catch (pollError) {
        const normalized = normalizeReelError(pollError);
        if (__DEV__) {
          console.warn('[InstagramShare][status-error]', {
            requestId: state.shareResultId ?? null,
            reelId: state.reel.id,
            errorCode: normalized.errorCode ?? null,
            message: normalized.message,
          });
        }
        // 앱 진입 시 상태를 확인하지 못한 경우 추측으로 카드를 표시하지 않습니다.
      } finally {
        verificationInFlight.delete(verificationKey);
      }
    };

    const refreshAfterExternalShare = async (requestId?: string) => {
      const firstRefreshedPlaces = await loadSavedPlaces();
      if (firstRefreshedPlaces === null) {
        return;
      }

      // COMPLETED 직후 읽기에서 새 장소가 아직 보이지 않는 짧은 지연을
      // 흡수하기 위해 한 번 더 조회한 뒤 공유 결과를 소비합니다.
      await new Promise<void>(resolve => setTimeout(resolve, 700));
      const secondRefreshedPlaces = await loadSavedPlaces();
      if (secondRefreshedPlaces !== null) {
        await onSharedResultConsumed?.(requestId);
      }
    };

    const applySharedState = (state: SharedSaveState | null) => {
      const view = classifySharedSaveState(state, verifiedKeys);
      dispatch({type: 'sharedStateChanged', view});
      if (!state) {
        return;
      }

      if (view.type === 'needs-verification') {
        if (!verificationInFlight.has(view.verificationKey)) {
          verifySharedReelBeforeShowing(state, view.verificationKey);
        }
        return;
      }

      if (view.type === 'show' && view.isCompleted) {
        if (state.source === 'instagram_share') {
          refreshAfterExternalShare(state.shareResultId).catch(
            () => undefined,
          );
        }
        setSharedSaveState(null);
      }
    };

    applySharedState(getSharedSaveState());
    const unsubscribe = subscribeSharedSaveState(applySharedState);
    return () => {
      isActive = false;
      unsubscribe();
    };
  }, [dispatch, enabled, loadSavedPlaces, onSharedResultConsumed]);
}
