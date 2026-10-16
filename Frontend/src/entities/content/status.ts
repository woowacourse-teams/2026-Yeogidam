import type {HistoryReel} from './types';

/** 공유의 장소 분석이 아직 끝나지 않았는지(PENDING이나 PROCESSING인지) 알려 줍니다. */
export function isReelInProgress(
  status: HistoryReel['processing_status'],
): status is 'PENDING' | 'PROCESSING' {
  return status === 'PENDING' || status === 'PROCESSING';
}
