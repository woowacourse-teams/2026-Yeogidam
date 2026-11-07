import {createSpringApiClient} from '../../lib/api/spring-client';
import {toReelApiError} from './api';
import type {HistoryCursor, HistoryReel} from './types';

const client = createSpringApiClient();
const SAVED_MEDIA_PATH = '/api/v1/saved-media';

type SpringSavedMedia = {
  sharedMediaId: number;
  createdAt: string;
  thumbnailUrl: string | null;
  caption: string | null;
  author: string | null;
  sharedUrl: string;
};

type SpringSavedMediaPage = {
  sharedMedia: SpringSavedMedia[];
  nextCursor: {createdAt: string; id: number} | null;
};

/** 목록 정보만 넘기고 상세 장소·북마크는 히스토리와 같은 조회 경로에서 읽습니다. */
function toReel(item: SpringSavedMedia): HistoryReel {
  return {
    id: String(item.sharedMediaId),
    instagram_url: item.sharedUrl,
    instagram_title: null,
    instagram_description: item.caption,
    instagram_author_username: item.author,
    instagram_thumbnail_url: item.thumbnailUrl,
    processing_status: 'COMPLETED',
    failure_reason: null,
    save_mode: null,
    created_at: item.createdAt,
  };
}

export async function getSavedMedia(cursor?: HistoryCursor): Promise<{
  reels: HistoryReel[];
  nextCursor: HistoryCursor | null;
}> {
  try {
    const response = await client.request<SpringSavedMediaPage>(SAVED_MEDIA_PATH, {
      query: cursor
        ? {cursorCreatedAt: cursor.created_at, cursorId: cursor.id}
        : undefined,
    });
    return {
      reels: (response.sharedMedia ?? []).map(toReel),
      nextCursor: response.nextCursor
        ? {created_at: response.nextCursor.createdAt, id: String(response.nextCursor.id)}
        : null,
    };
  } catch (error) {
    throw toReelApiError(error);
  }
}

export async function deleteSavedMedia(sharedMediaIds: string[]): Promise<void> {
  if (sharedMediaIds.length === 0) return;
  try {
    await client.request<void>(SAVED_MEDIA_PATH, {
      method: 'DELETE',
      query: {sharedMediaIds},
    });
  } catch (error) {
    throw toReelApiError(error);
  }
}

export async function saveMediaPlace(sharedMediaId: string, placeId: string): Promise<string> {
  try {
    const response = await client.request<{savedPlaceId: number}>('/api/v1/saved-places', {
      method: 'POST',
      body: {sharedMediaId: Number(sharedMediaId), placeId: Number(placeId)},
    });
    return String(response.savedPlaceId);
  } catch (error) {
    throw toReelApiError(error);
  }
}
