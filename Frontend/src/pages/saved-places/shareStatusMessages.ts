import type {HistoryReel} from '../../entities/content/types';

/**
 * 링크 저장 요청을 서버가 받아 장소 찾기를 시작했을 때 읽어 줍니다.
 * 최근 공유 줄이 보이면 그 썸네일로 포커스를 옮기고, 줄이 없을 때만 이 문구를 읽습니다.
 */
export const SHARE_ACCEPTED_MESSAGE = '링크를 받았어요. 장소를 찾는 중이에요.';

/** Instagram 공유 시트로 보낸 링크를 앱에서 처리하기 시작했을 때 읽어 줍니다. */
export const SHARE_PROCESSING_MESSAGE = '공유한 링크에서 장소를 찾는 중이에요.';

/** 장소 찾기가 오래 걸릴 때 멈춘 게 아니라는 것을 한 번만 알립니다. */
export const SHARE_STILL_PROCESSING_MESSAGE = '아직 장소를 찾고 있어요.';

/** 서버가 장소 찾기에 실패했을 때 읽어 줍니다. */
export const SHARE_FAILED_MESSAGE = '장소를 찾지 못했어요. 다시 시도해 주세요.';

/** 장소 찾기가 끝났을 때 읽어 줍니다. 장소 수를 못 읽었으면 끝났다는 것만 알립니다. */
export function getShareCompletedMessage(placeCount: number | null) {
  if (placeCount === null) return '장소 찾기가 끝났어요.';
  if (placeCount === 0) return '게시물에서 장소를 찾지 못했어요.';
  return `장소 ${placeCount}곳을 찾았어요.`;
}

/**
 * 최근 공유 썸네일을 스크린 리더가 읽는 문구입니다. 링 색으로만 보이던 상태를 말로도 전합니다.
 * 완료된 공유의 장소 수는 따로 읽어 오므로, 아직 없으면 완료라는 것만 읽습니다.
 */
export function getRecentShareAccessibilityLabel(
  status: HistoryReel['processing_status'],
  placeCount?: number,
) {
  switch (status) {
    case 'PROCESSING':
      return '최근 공유, 장소 찾는 중';
    // 화면에 보이는 "완료"로 시작해, 링에 포커스하면 "완료, 장소 4곳 찾음, 버튼"으로 읽힙니다.
    case 'COMPLETED':
      if (placeCount === undefined) return '완료';
      if (placeCount === 0) return '완료, 찾은 장소 없음';
      return `완료, 장소 ${placeCount}곳 찾음`;
    case 'FAILED':
      return '최근 공유, 장소 찾기 실패';
    default:
      return '최근 공유, 대기 중';
  }
}
