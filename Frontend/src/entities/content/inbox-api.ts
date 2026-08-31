import {SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, supabase} from '../../lib/auth/supabase';

import {ReelApiError} from './errors';

const INBOX_REELS_SELECT = [
  'id',
  'instagram_title',
  'instagram_description',
  'instagram_author_username',
  'instagram_thumbnail_url',
  'reel_places!inner(id,position,review_status,reviewed_at,place:places(id,name,category,source_address,road_address,address,latitude,longitude,kakao_place_url,thumbnail_url,photo_attribution))',
].join(',');

type InboxPlaceResponse = {
  id: string;
  position: number;
  review_status: string;
  reviewed_at: string | null;
  place: {
    id: string;
    name: string;
    category: string | null;
    source_address: string | null;
    road_address: string | null;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
    kakao_place_url: string | null;
    thumbnail_url: string | null;
    photo_attribution: string | null;
  } | null;
};

type InboxReelResponse = {
  id: string;
  instagram_title: string | null;
  instagram_description: string | null;
  instagram_author_username: string | null;
  instagram_thumbnail_url: string | null;
  reel_places: InboxPlaceResponse[];
};

export type InboxPlace = {
  id: string;
  position: number;
  reviewStatus: string;
  reviewedAt: string | null;
  place: {
    id: string;
    name: string;
    category: string | null;
    sourceAddress: string | null;
    roadAddress: string | null;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
    kakaoPlaceUrl: string | null;
    thumbnailUrl: string | null;
    photoAttribution: string | null;
  } | null;
};

export type InboxReel = {
  id: string;
  instagramTitle: string | null;
  instagramDescription: string | null;
  instagramAuthorUsername: string | null;
  instagramThumbnailUrl: string | null;
  places: InboxPlace[];
};

export type QueueResolutionAction = 'SAVE' | 'DISCARD';

function toInboxReel(reel: InboxReelResponse): InboxReel {
  return {
    id: reel.id,
    instagramTitle: reel.instagram_title,
    instagramDescription: reel.instagram_description,
    instagramAuthorUsername: reel.instagram_author_username,
    instagramThumbnailUrl: reel.instagram_thumbnail_url,
    places: (reel.reel_places ?? []).map(reelPlace => ({
      id: reelPlace.id,
      position: reelPlace.position,
      reviewStatus: reelPlace.review_status,
      reviewedAt: reelPlace.reviewed_at,
      place: reelPlace.place
        ? {
            id: reelPlace.place.id,
            name: reelPlace.place.name,
            category: reelPlace.place.category,
            sourceAddress: reelPlace.place.source_address,
            roadAddress: reelPlace.place.road_address,
            address: reelPlace.place.address,
            latitude: reelPlace.place.latitude,
            longitude: reelPlace.place.longitude,
            kakaoPlaceUrl: reelPlace.place.kakao_place_url,
            thumbnailUrl: reelPlace.place.thumbnail_url,
            photoAttribution: reelPlace.place.photo_attribution,
          }
        : null,
    })),
  };
}

function inboxError(status: number | null, message: string, retryable: boolean) {
  return new ReelApiError({
    errorCode:
      status === 400
        ? 'COMMON400_001'
        : status === 401
          ? 'AUTH401_002'
          : status === 403
            ? 'AUTH403_001'
            : status === null
              ? 'CLIENT000_001'
              : 'DATA500_001',
    message,
    retryable,
    status,
  });
}

function responseError(status: number): ReelApiError {
  if (status === 400) {
    return inboxError(400, '요청 내용을 확인해주세요.', false);
  }
  if (status === 401) {
    return inboxError(401, '로그인이 만료됐어요. 다시 로그인해주세요.', true);
  }
  if (status === 403) {
    return inboxError(403, '이 작업을 수행할 권한이 없어요.', false);
  }
  if (status === 408 || status === 504) {
    return new ReelApiError({
      errorCode: 'CLIENT000_002',
      message: '응답이 늦어지고 있어요. 잠시 후 다시 시도해주세요.',
      retryable: true,
      status,
    });
  }
  return inboxError(
    status,
    '데이터를 처리하지 못했어요. 잠시 후 다시 시도해주세요.',
    true,
  );
}

async function getInboxReelsOnce(): Promise<InboxReel[]> {
  const {
    data: {session},
  } = await supabase.auth.getSession();
  const query = [
    `select=${encodeURIComponent(INBOX_REELS_SELECT)}`,
    'processing_status=eq.COMPLETED',
    'save_mode=eq.REVIEW_QUEUE',
    'reel_places.review_status=eq.PENDING',
    'order=created_at.desc',
    'reel_places.order=position.asc',
  ].join('&');
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  let response: Response;
  try {
    response = await fetch(`${SUPABASE_URL}/rest/v1/reels?${query}`, {
      headers: {
        Accept: 'application/json',
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${session?.access_token ?? SUPABASE_PUBLISHABLE_KEY}`,
      },
      signal: controller.signal,
    });
  } catch {
    throw controller.signal.aborted
      ? new ReelApiError({
          errorCode: 'CLIENT000_002',
          message: '응답이 늦어지고 있어요. 잠시 후 다시 시도해주세요.',
          retryable: true,
        })
      : inboxError(null, '인터넷 연결을 확인해주세요.', true);
  } finally {
    clearTimeout(timeoutId);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw inboxError(response.status, '응답을 처리하지 못했어요.', false);
  }

  if (!response.ok) {
    throw responseError(response.status);
  }

  return (body as InboxReelResponse[]).map(toInboxReel);
}

/** 대기 중인 장소가 하나 이상인 완료 릴스 목록입니다. */
export async function getInboxReels(): Promise<InboxReel[]> {
  try {
    return await getInboxReelsOnce();
  } catch (error) {
    if ((error as ReelApiError).status === 401) {
      const {
        data: {session},
        error: refreshError,
      } = await supabase.auth.refreshSession();

      if (!refreshError && session) {
        return getInboxReelsOnce();
      }
    }
    throw error;
  }
}

function queueResolutionError(status: number | null, message: string) {
  const isSelectionError = [
    'queue_selection_required',
    'queue_selection_contains_duplicates_or_nulls',
    'invalid_queue_action',
  ].includes(message);
  const isChangedError = [
    'queue_items_not_available',
    'queue_items_changed_during_request',
  ].includes(message);

  return new ReelApiError({
    errorCode:
      status === 401
        ? 'AUTH401_002'
        : isSelectionError
          ? 'COMMON400_001'
          : isChangedError
            ? 'DATA500_001'
            : status === null
              ? 'CLIENT000_001'
              : 'DATA500_001',
    message: isSelectionError
      ? '선택한 장소를 다시 확인해주세요.'
      : isChangedError
        ? '대기 항목이 변경되었어요. 새로고침 후 다시 선택해주세요.'
        : status === 401
          ? '로그인이 만료됐어요. 다시 로그인해주세요.'
          : status === null
            ? '인터넷 연결을 확인해주세요.'
            : '대기 항목을 처리하지 못했어요. 잠시 후 다시 시도해주세요.',
    retryable: status === null || status === 401,
    status,
  });
}

/** 선택한 대기 장소를 보관함에 저장하거나 대기함에서 폐기합니다. */
export async function resolveQueueItems(
  reelPlaceIds: string[],
  action: QueueResolutionAction,
): Promise<number> {
  const uniqueIds = [...new Set(reelPlaceIds)];
  if (
    uniqueIds.length === 0 ||
    uniqueIds.length !== reelPlaceIds.length ||
    !uniqueIds.every(id => typeof id === 'string' && id.length > 0)
  ) {
    throw queueResolutionError(400, 'queue_selection_required');
  }

  const {
    data: {session},
  } = await supabase.auth.getSession();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  let response: Response;
  try {
    response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/resolve_queue_items`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${session?.access_token ?? SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({
        p_reel_place_ids: uniqueIds,
        p_action: action,
      }),
      signal: controller.signal,
    });
  } catch {
    if (controller.signal.aborted) {
      throw new ReelApiError({
        errorCode: 'CLIENT000_002',
        message: '응답이 늦어지고 있어요. 잠시 후 다시 시도해주세요.',
        retryable: true,
      });
    }
    throw queueResolutionError(null, 'network_error');
  } finally {
    clearTimeout(timeoutId);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw queueResolutionError(response.status, 'invalid_response');
  }

  if (!response.ok) {
    const message =
      body && typeof body === 'object' && typeof (body as {message?: unknown}).message === 'string'
        ? (body as {message: string}).message
        : 'request_failed';
    throw queueResolutionError(response.status, message);
  }

  if (typeof body !== 'number') {
    throw queueResolutionError(response.status, 'invalid_response');
  }

  return body;
}
