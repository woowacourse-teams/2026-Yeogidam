import {useCallback} from 'react';
import {v4 as uuidv4} from 'uuid';

import type {AnalyticsClient} from '../../analytics/analytics';
import {
  toExtractionFailureType,
  trackExtractionRequestFinished,
  trackExtractionRequestStarted,
} from '../../analytics/placeExtractionEvents';
import {normalizeReelError} from '../../entities/content/errors';
import {retryHistoryReelExtraction} from '../../entities/content/history-api';
import type {HistoryReel} from '../../entities/content/types';
import {setLastSeenHistorySnapshot} from '../../lib/history-notification-storage';
import {toRetryFailureMessage} from './history-format';

/**
 * 재시도 요청 결과입니다. 접수되면 목록에 바로 넣을 카드(이미 있던 공유로 접수되면 null)를,
 * 실패하면 사용자에게 보일 문구를 담습니다.
 */
export type HistoryRetryOutcome =
  | {status: 'accepted'; acceptedReel: HistoryReel | null}
  | {status: 'failed'; message: string};

/**
 * 실패한 히스토리 항목의 장소 추출을 다시 요청합니다. 추출 요청 지표를 남기고, 접수되면 본 히스토리로
 * 기록합니다. 실패 안내 창과 목록으로 돌아가는 화면 전환은 결과를 받은 화면이 맡습니다.
 */
export function useHistoryRetry(posthog: AnalyticsClient | null | undefined) {
  const retryReel = useCallback(async (reel: HistoryReel): Promise<HistoryRetryOutcome> => {
    const requestId = uuidv4();
    trackExtractionRequestStarted(posthog, {
      requestId,
      source: 'history_retry',
    });
    let response: Awaited<ReturnType<typeof retryHistoryReelExtraction>>;
    try {
      // 서버 재시도 API는 같은 게시물로 새 공유를 만들고(이미 추출 중이면 그 공유를) 돌려준다.
      response = await retryHistoryReelExtraction(reel.id);
    } catch (retryError) {
      const normalized = normalizeReelError(retryError);
      trackExtractionRequestFinished(posthog, {
        requestId,
        source: 'history_retry',
        outcome: 'request_failed',
        failureType: toExtractionFailureType(normalized),
        responseStatus: normalized.status,
      });
      return {status: 'failed', message: toRetryFailureMessage(normalized)};
    }
    // 2xx 응답이면 응답 안의 추출 상태가 FAILED여도 응답 수신으로 기록한다.
    trackExtractionRequestFinished(posthog, {
      requestId,
      source: 'history_retry',
      outcome: 'response_received',
      contentId: response.reelId,
    });

    // 이 화면에서 바로 보게 되므로 대기함으로 돌아갈 때 안 읽은 히스토리로 표시하지 않는다.
    await setLastSeenHistorySnapshot({
      id: response.reelId,
      status: response.status,
    });

    // 같은 게시물을 다시 처리하므로 접수된 공유는 실패 카드의 내용으로 바로 보여 준다.
    // 생성 시각 등 서버 값은 이어지는 목록 조회가 같은 ID로 덮어쓴다.
    const acceptedReel: HistoryReel | null = response.reused
      ? null
      : {
          ...reel,
          id: response.reelId,
          processing_status: response.status,
          failure_reason: null,
          created_at: new Date().toISOString(),
        };
    return {status: 'accepted', acceptedReel};
  }, [posthog]);

  return {retryReel};
}
