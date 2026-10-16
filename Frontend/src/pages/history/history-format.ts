import type {ImageSourcePropType} from 'react-native';

import type {HistoryVisibleState} from '../../analytics/placeExtractionEvents';
import {isReelInProgress} from '../../entities/content/status';
import {normalizeReelTitle} from '../../entities/content/title';
import type {HistoryReel} from '../../entities/content/types';

/** 썸네일 주소가 없는 히스토리 항목에 보여 주는 기본 이미지입니다. */
export const HISTORY_FALLBACK_THUMBNAIL =
  'https://www.figma.com/api/mcp/asset/88501ab5-fdd5-49c7-bda1-e486a502a36c.png';

/** 히스토리 카드와 상세에 보일 제목입니다. 캡션과 제목이 모두 없으면 '저장한 콘텐츠'입니다. */
export function getHistoryTitle(reel: HistoryReel) {
  return normalizeReelTitle(reel.instagram_description, reel.instagram_title);
}

/** 캡션이나 제목에서 보일 제목을 얻었는지 알려 줍니다. */
export function hasResolvedHistoryTitle(reel: HistoryReel) {
  return getHistoryTitle(reel) !== '저장한 콘텐츠';
}

/**
 * 히스토리 카드와 두 상세에 보일 썸네일을 앱에 들어 있는 그림(비회원 체험 항목), 원격 썸네일, 기본
 * 이미지 순서로 고릅니다.
 */
export function toHistoryThumbnailSource(reel: HistoryReel): ImageSourcePropType {
  return reel.local_thumbnail_source ?? {uri: reel.instagram_thumbnail_url ?? HISTORY_FALLBACK_THUMBNAIL};
}

function getFailureCode(reason: string | null) {
  return reason?.split(' | ', 1)[0]?.trim() || null;
}

/** 실패 이유를 사용자에게 보일 문구로 바꿉니다. '코드 | 설명' 형식이면 앞의 코드만 봅니다. */
export function getHistoryFailureMessage(reason: string | null) {
  switch (getFailureCode(reason)) {
    case 'CLIENT000_001':
      return '인터넷 연결이 불안정해요.';
    case 'CLIENT000_002':
      return '응답이 늦어져 분석하지 못했어요.';
    case 'AUTH401_001':
      return '로그인이 필요해요.';
    case 'AUTH401_002':
      return '로그인이 만료됐어요.';
    case 'AUTH403_001':
      return '분석할 권한이 없어요.';
    case 'IG_CAPTION_NOT_FOUND':
      return '릴스 내용을 읽지 못했어요.';
    case 'GEMINI_PLACE_NOT_FOUND':
      return '캡션에서 장소를 찾지 못했어요.';
    case 'KAKAO_PLACE_NOT_FOUND':
      return '지도에서 일치하는 장소를 찾지 못했어요.';
    case 'PLACE_NOT_FOUND':
      return '장소를 찾지 못했어요.';
    // Spring 서버 ExtractionFailureReason
    case 'CONTENT_UNAVAILABLE':
      return '원본 릴스를 불러오지 못했어요.';
    case 'PLACE_NOT_EXTRACTED':
      return '릴스에서 장소 정보를 찾지 못했어요.';
    case 'PLACE_NOT_MATCHED':
      return '지도에서 장소를 찾지 못했어요.';
    case 'PROCESSING_FAILED':
      return '장소 정보를 처리하지 못했어요.';
    case 'UNEXPECTED':
      return '알 수 없는 문제가 발생했어요.';
    case 'DATA500_001':
    case 'COMMON500_001':
      return '서버에서 분석을 처리하지 못했어요.';
    default:
      return '장소 분석에 실패했어요. 잠시 후 다시 시도해주세요.';
  }
}

/** 생성 시각을 기기 시간대의 'YYYY.MM.DD'로 바꿉니다. 날짜로 읽을 수 없으면 받은 값을 그대로 돌려줍니다. */
export function formatHistoryDate(createdAt: string) {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    return createdAt;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}.${month}.${day}`;
}

/**
 * 카드에 보일 상태입니다. 카드의 배지와 뼈대를 고를 때와 카드 노출 지표에 남길 때 함께 씁니다.
 * 처리 중인데 썸네일이나 제목이 아직 없어 뼈대로 보이는 카드는 'loading'입니다.
 */
export function getHistoryVisibleState(reel: HistoryReel): HistoryVisibleState {
  if (isReelInProgress(reel.processing_status)) {
    return !reel.instagram_thumbnail_url || !hasResolvedHistoryTitle(reel) ? 'loading' : 'processing';
  }
  return reel.processing_status === 'COMPLETED' ? 'success' : 'failed';
}

/**
 * 카드 높이의 절반 이상이 목록 화면 안에 보이는지 알려 줍니다. 카드 노출 지표를 셀지 정할 때 씁니다.
 * 카드와 화면 위치는 목록 맨 위에서 잰 값으로 받고, 경계에 닿기만 한 카드는 보이지 않은 것으로 봅니다.
 */
export function isCardHalfVisible(
  card: {top: number; height: number},
  viewport: {top: number; bottom: number},
) {
  const visibleHeight = Math.max(
    0,
    Math.min(card.top + card.height, viewport.bottom) - Math.max(card.top, viewport.top),
  );
  return visibleHeight >= card.height / 2;
}

/**
 * 항목을 만든 날짜별로 묶어 [날짜, 항목 목록] 쌍으로 돌려줍니다. 날짜와 항목은 목록에서 처음 나온
 * 순서를 따르고, 떨어져 있는 같은 날짜 항목은 앞에서 만든 묶음 뒤에 붙습니다.
 */
export function groupHistoryReelsByDate(reels: HistoryReel[]): [string, HistoryReel[]][] {
  const groups = reels.reduce<Record<string, HistoryReel[]>>((result, reel) => {
    const date = formatHistoryDate(reel.created_at);
    result[date] = result[date] ? [...result[date], reel] : [reel];
    return result;
  }, {});
  return Object.entries(groups);
}
