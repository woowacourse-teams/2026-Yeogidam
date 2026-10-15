import {toScreenApiError} from '../../lib/api/screen-error';
import {createSpringApiClient} from '../../lib/api/spring-client';
import type {SpringMember} from '../../lib/api/spring-auth-api';
import type {
  CurrentProfileRepository,
  PlaceReelsRepository,
  SavedPlacesRepository,
} from './types';

const client = createSpringApiClient();

/** 화면은 {status, errorCode, message, retryable} 계약으로 오류를 분기합니다. */
async function withScreenError<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw toScreenApiError(error);
  }
}

type SavedPlaceResponse = {
  savedPlaceId: number;
  placeId: number;
  name: string;
  category: string | null;
  landLotAddress: string | null;
  roadAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  kakaoPlaceUrl: string | null;
  thumbnailUrl: string | null;
  lastSavedAt: string;
};

type SavedPlaceMediaResponse = {
  sharedMediaId: number;
  thumbnailUrl: string | null;
  author: string | null;
  caption: string | null;
  sharedUrl: string;
  createdAt: string;
};

export const springProfileRepository: CurrentProfileRepository = {
  getCurrentProfile: () =>
    withScreenError(async () => {
      const member = await client.request<SpringMember>('/api/v1/members/me');
      return {
        id: String(member.id),
        nickname: member.nickname,
        avatarUrl: member.imageUrl,
        description: null,
        oauthProvider: member.oauthProvider,
      };
    }),
};

export const springSavedPlacesRepository: SavedPlacesRepository = {
  getSavedPlaces: () => withScreenError(async () => {
    const response = await client.request<{savedPlaces: SavedPlaceResponse[]}>(
      '/api/v1/saved-places',
    );
    return response.savedPlaces.map(item => ({
      id: String(item.savedPlaceId),
      thumbnailUrl: item.thumbnailUrl,
      createdAt: item.lastSavedAt,
      lastSavedAt: item.lastSavedAt,
      place: {
        id: String(item.placeId),
        name: item.name,
        category: item.category,
        sourceAddress: item.landLotAddress,
        address: item.landLotAddress,
        roadAddress: item.roadAddress,
        latitude: item.latitude,
        longitude: item.longitude,
        kakaoPlaceUrl: item.kakaoPlaceUrl,
        thumbnailUrl: item.thumbnailUrl,
      },
    }));
  }),
  deleteSavedPlaces: savedPlaceIds => withScreenError(async () => {
    if (savedPlaceIds.length === 0) return;
    await client.request<void>('/api/v1/saved-places', {
      method: 'DELETE',
      query: {savedPlaceIds},
    });
  }),
};

export const springPlaceReelsRepository: PlaceReelsRepository = {
  getPlaceReels: placeId => withScreenError(async () => {
    // 화면은 장소 ID를 전달하지만 서버의 미디어 경로에는 저장 장소 ID가 필요합니다.
    const savedPlaces = await springSavedPlacesRepository.getSavedPlaces();
    const savedPlace = savedPlaces.find(item => item.place.id === placeId);
    if (!savedPlace) return [];

    const response = await client.request<{media: SavedPlaceMediaResponse[]}>(
      `/api/v1/saved-places/${encodeURIComponent(savedPlace.id)}/media`,
    );
    return response.media.map(item => ({
      id: String(item.sharedMediaId),
      instagramUrl: item.sharedUrl,
      instagramAuthorUsername: item.author,
      instagramDescription: item.caption,
      instagramThumbnailUrl: item.thumbnailUrl,
      createdAt: item.createdAt,
    }));
  }),
};
