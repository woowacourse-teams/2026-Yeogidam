import {ApiError} from '../../lib/api/errors';
import {createSpringApiClient} from '../../lib/api/spring-client';
import {toReelApiError, toReelStatus, type SpringShareHistoryItem} from './api';
import type {
  HistoryCursor,
  HistoryReel,
  HistoryReelDetail,
  HistoryReelPlace,
  SaveInstagramReelResponse,
} from './types';
import {ReelApiError} from './errors';

const client = createSpringApiClient();
const SHARES_PATH = '/api/v1/shares';

type SpringShareHistoryResponse = {
  sharedMedias: SpringShareHistoryItem[] | null;
  nextCursor: {createdAt: string; id: number} | null;
};

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

async function requestShares(cursor?: HistoryCursor): Promise<SpringShareHistoryResponse> {
  try {
    return await client.request<SpringShareHistoryResponse>(SHARES_PATH, {
      query: cursor
        ? {cursorCreatedAt: cursor.created_at, cursorId: cursor.id}
        : undefined,
    });
  } catch (error) {
    throw toReelApiError(error);
  }
}

export async function getHistoryReels(cursor?: HistoryCursor): Promise<{
  reels: HistoryReel[];
  nextCursor: HistoryCursor | null;
}> {
  const response = await requestShares(cursor);
  const nextCursor = response?.nextCursor;
  return {
    reels: (response?.sharedMedias ?? []).map(toHistoryReel),
    nextCursor: nextCursor
      ? {created_at: nextCursor.createdAt, id: String(nextCursor.id)}
      : null,
  };
}

/**
 * 서버에 단건 공유 조회 API가 없어 최근 공유 첫 페이지에서 찾습니다. 장소는 추출에
 * 성공한 공유만 조회합니다(추출 중·실패 공유는 서버가 400을 돌려줍니다).
 */
export async function getHistoryReelDetail(
  reelId: string,
): Promise<HistoryReelDetail | null> {
  const response = await requestShares();
  const item = response?.sharedMedias?.find(
    share => String(share.sharedMediaId) === reelId,
  );
  if (!item) return null;

  const reel = toHistoryReel(item);
  if (reel.processing_status !== 'COMPLETED') {
    return {...reel, extraction: null};
  }

  let places: SpringShareHistoryPlacesResponse;
  try {
    places = await client.request<SpringShareHistoryPlacesResponse>(
      `${SHARES_PATH}/${encodeURIComponent(reelId)}/places`,
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
    if (error instanceof ApiError) {
      if (error.errorCode === 'MEDIA409_001') return;
      // 201 응답은 본문이 비어 있어 공용 클라이언트가 JSON 파싱 실패로 처리합니다.
      if (error.kind === 'invalid_response' && error.status === 201) return;
    }
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
    throw new ReelApiError({
      errorCode: 'CLIENT000_003',
      message: '응답을 처리하지 못했어요.',
    });
  }

  return {
    reelId: String(response.sharedMediaId),
    status: toReelStatus(response.extractionStatus),
    reused: response.extractionStatus === 'SUCCEEDED',
  };
}
