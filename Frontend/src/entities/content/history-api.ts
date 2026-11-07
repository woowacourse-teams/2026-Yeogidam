import {ApiError} from '../../lib/api/errors';
import {createSpringApiClient} from '../../lib/api/spring-client';
import {getSavedPlaces} from '../info/api';
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
    ...(item.deletedAt != null ? {deleted_from_library: true} : {}),
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
 * 상세는 보관함·히스토리에서 같은 공유별 장소 API로 조회합니다. 서버에 단건 공유
 * 조회 API가 없어 게시물 기본 정보는 진입한 목록에서 받은 값을 사용합니다.
 */
export async function getHistoryReelDetail(
  reel: HistoryReel,
): Promise<HistoryReelDetail> {
  if (reel.processing_status !== 'COMPLETED') {
    return {...reel, extraction: null};
  }

  let places: SpringShareHistoryPlacesResponse;
  let savedPlaceIds: Map<string, string>;
  try {
    const [historyPlaces, savedPlaces] = await Promise.all([
      client.request<SpringShareHistoryPlacesResponse>(
        `${SHARES_PATH}/${encodeURIComponent(reel.id)}/places`,
      ),
      getSavedPlaces(),
    ]);
    places = historyPlaces;
    savedPlaceIds = new Map(savedPlaces.map(item => [item.place.id, item.id]));
  } catch (error) {
    throw toReelApiError(error);
  }

  return {
    ...reel,
    extraction: {
      extraction_places: (places?.places ?? []).map((place, position) => ({
        ...toHistoryReelPlace(place, position),
        savedPlaceId: savedPlaceIds.get(String(place.placeId)) ?? null,
      })),
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
