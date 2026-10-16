import {ApiError} from '../../lib/api/errors';
import {PROCESSING_ERROR} from '../../lib/api/screen-error';
import {createSpringApiClient} from '../../lib/api/spring-client';
import {getSharesPage, toReelApiError, toReelStatus} from './api';
import {
  SHARES_PATH,
  isSpringSharesCursor,
  type SpringShareHistoryItem,
  type SpringSharesCursor,
} from './shares-request';
import type {
  HistoryCursor,
  HistoryReel,
  HistoryReelDetail,
  HistoryReelPlace,
  SaveInstagramReelResponse,
} from './types';
import {ReelApiError} from './errors';

const client = createSpringApiClient();

/** 서버 ShareHistoryPlaceResponse. 좌표·카카오 URL·사진 출처는 내려오지 않습니다. */
type SpringShareHistoryPlace = {
  placeId: number;
  thumbnailUrl: string | null;
  name: string;
  category: string | null;
  landLotAddress: string | null;
  roadAddress: string | null;
};

type SpringShareHistoryPlacesResponse = {
  places: SpringShareHistoryPlace[] | null;
};

export function toHistoryReel(item: SpringShareHistoryItem): HistoryReel {
  return {
    id: String(item.sharedMediaId),
    instagram_url: item.sharedUrl,
    instagram_title: null,
    instagram_description: item.caption,
    instagram_author_username: item.author,
    instagram_thumbnail_url: item.thumbnailUrl,
    processing_status: toReelStatus(item.extractionStatus),
    failure_reason: item.failureReason,
    save_mode: null,
    created_at: item.createdAt,
  };
}

export function toHistoryReelPlace(
  place: SpringShareHistoryPlace,
  position: number,
): HistoryReelPlace {
  return {
    id: String(place.placeId),
    position,
    place: {
      id: String(place.placeId),
      name: place.name,
      category: place.category,
      source_address: null,
      road_address: place.roadAddress,
      address: place.landLotAddress,
      latitude: null,
      longitude: null,
      kakao_place_url: null,
      thumbnail_url: place.thumbnailUrl,
      photo_attribution: null,
    },
  };
}

/**
 * 공유 목록 한 쪽을 히스토리 카드와 다음 커서로 바꿉니다. 목록 배열이 없거나 다음 커서 모양이 어긋난 응답은
 * 빈 목록이나 마지막 쪽으로 보지 않고 응답 처리 오류(CLIENT000_003)입니다.
 */
export async function getHistoryReels(cursor?: HistoryCursor): Promise<{
  reels: HistoryReel[];
  nextCursor: HistoryCursor | null;
}> {
  const page = await getSharesPage(cursor ? toSpringSharesCursor(cursor) : undefined);
  return {
    reels: page.sharedMedias.map(toHistoryReel),
    nextCursor: toHistoryCursor(page.nextCursor),
  };
}

/** 앱 커서(created_at, 문자열 id)와 서버 커서(createdAt, 숫자 id)를 서로 바꿉니다. 두 방향을 이 파일 한 곳에 둡니다. */
function toSpringSharesCursor(cursor: HistoryCursor): SpringSharesCursor {
  return {createdAt: cursor.created_at, id: Number(cursor.id)};
}

/**
 * 받은 다음 커서를 앱 커서로 바꿉니다. null이나 생략은 마지막 쪽이라 null입니다. 모양이 어긋나면 그대로 썼을 때
 * 더 보기 요청이 cursorId=undefined나 NaN으로 나가므로, 응답 처리 오류로 던집니다. 커서를 쓰는 히스토리만 확인합니다.
 */
function toHistoryCursor(nextCursor: unknown): HistoryCursor | null {
  if (nextCursor == null) return null;
  if (!isSpringSharesCursor(nextCursor)) {
    throw new ReelApiError({...PROCESSING_ERROR});
  }
  return {created_at: nextCursor.createdAt, id: String(nextCursor.id)};
}

/**
 * 서버에 단건 공유 조회 API가 없어 목록에서 받은 공유 정보를 그대로 씁니다. 장소는
 * 추출에 성공한 공유만 조회합니다(추출 중·실패 공유는 서버가 400을 돌려줍니다).
 */
export async function getHistoryReelDetail(
  reel: HistoryReel,
): Promise<HistoryReelDetail> {
  if (reel.processing_status !== 'COMPLETED') {
    return {...reel, extraction: null};
  }

  let places: SpringShareHistoryPlacesResponse;
  try {
    places = await client.request<SpringShareHistoryPlacesResponse>(
      `${SHARES_PATH}/${encodeURIComponent(reel.id)}/places`,
    );
  } catch (error) {
    throw toReelApiError(error);
  }

  return {
    ...reel,
    extraction: {
      extraction_places: (places?.places ?? []).map(toHistoryReelPlace),
    },
  };
}

/** 이미 신고한 공유(MEDIA409_001)는 성공으로 봅니다. */
export async function reportHistoryReel(reelId: string): Promise<void> {
  try {
    await client.request<void>(`${SHARES_PATH}/${encodeURIComponent(reelId)}/reports`, {
      method: 'POST',
    });
  } catch (error) {
    if (error instanceof ApiError && error.errorCode === 'MEDIA409_001') return;
    throw toReelApiError(error);
  }
}

type SpringExtractionRetryResponse = {
  sharedMediaId: number;
  extractionStatus: string;
};

/**
 * 실패한 공유의 추출을 다시 요청합니다. 서버는 새 공유(또는 이미 추출 중인 공유)의 ID를
 * 돌려주므로 화면은 응답 ID를 새 히스토리 항목으로 다룹니다.
 */
export async function retryHistoryReelExtraction(
  reelId: string,
): Promise<SaveInstagramReelResponse> {
  let response: SpringExtractionRetryResponse;
  try {
    response = await client.request<SpringExtractionRetryResponse>(
      `${SHARES_PATH}/${encodeURIComponent(reelId)}/extraction-retries`,
      {method: 'POST'},
    );
  } catch (error) {
    throw toReelApiError(error);
  }

  if (response?.sharedMediaId == null || !response.extractionStatus) {
    throw new ReelApiError({...PROCESSING_ERROR});
  }

  return {
    reelId: String(response.sharedMediaId),
    status: toReelStatus(response.extractionStatus),
    reused: response.extractionStatus === 'SUCCEEDED',
  };
}
