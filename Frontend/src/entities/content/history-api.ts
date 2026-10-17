import {ApiError} from '../../lib/api/errors';
import {PROCESSING_ERROR} from '../../lib/api/screen-error';
import {createSpringApiClient} from '../../lib/api/spring-client';
import {getSharesPage, toReelApiError, toReelStatus, withReelError} from './api';
import {SHARES_PATH, type SpringShareHistoryItem, type SpringSharesCursor} from './shares-request';
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
 * 공유 목록 한 쪽을 히스토리 카드와 다음 커서로 바꿉니다. 목록 배열이 없는 응답은 빈 목록이 아니라 응답 처리 오류(CLIENT000_003)입니다.
 * 앱 공용 폴러(처리 상태 폴링, 배지)도 이 함수로 읽으므로, 여기서 던지는 오류는 히스토리 화면만이 아니라 폴링과 배지도 멈춥니다.
 */
export async function getHistoryReels(cursor?: HistoryCursor): Promise<{
  reels: HistoryReel[];
  nextCursor: HistoryCursor | null;
}> {
  const page = await getSharesPage(cursor ? toSpringSharesCursor(cursor) : undefined);
  return {
    reels: page.sharedMedias.map(toHistoryReel),
    nextCursor: page.nextCursor ? toHistoryCursor(page.nextCursor) : null,
  };
}

/**
 * 앱 커서(created_at, 문자열 id)와 서버 커서(createdAt, 숫자 id)를 서로 바꿉니다. 두 방향을 이 파일 한 곳에 둡니다.
 * 받은 커서의 모양은 확인하지 않습니다(SpringSharesPage 설명 참고).
 */
function toSpringSharesCursor(cursor: HistoryCursor): SpringSharesCursor {
  return {createdAt: cursor.created_at, id: Number(cursor.id)};
}

function toHistoryCursor(cursor: SpringSharesCursor): HistoryCursor {
  return {created_at: cursor.createdAt, id: String(cursor.id)};
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

  const places = await withReelError(() =>
    client.request<SpringShareHistoryPlacesResponse>(
      `${SHARES_PATH}/${encodeURIComponent(reel.id)}/places`,
    ),
  );

  return {
    ...reel,
    extraction: {
      extraction_places: (places?.places ?? []).map(toHistoryReelPlace),
    },
  };
}

/**
 * 이미 신고한 공유(MEDIA409_001)는 성공으로 봅니다. 성공으로 볼 오류를 거르는 분기가 있어 withReelError로 감싸면
 * catch가 두 겹이 되므로, catch 하나에서 성공과 변환을 가립니다.
 */
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
  const response = await withReelError(() =>
    client.request<SpringExtractionRetryResponse>(
      `${SHARES_PATH}/${encodeURIComponent(reelId)}/extraction-retries`,
      {method: 'POST'},
    ),
  );

  if (response?.sharedMediaId == null || !response.extractionStatus) {
    throw new ReelApiError({...PROCESSING_ERROR});
  }

  return {
    reelId: String(response.sharedMediaId),
    status: toReelStatus(response.extractionStatus),
    reused: response.extractionStatus === 'SUCCEEDED',
  };
}
