import {toScreenApiError} from '../../lib/api/screen-error';
import {createSpringApiClient} from '../../lib/api/spring-client';
import type {SpringMember} from '../../lib/api/spring-auth-api';
import {toMapProvider} from '../place/mapProvider';
import type {
  CurrentProfileRepository,
  PlaceBlogPost,
  PlaceDetailInfo,
  PlaceDetailRepository,
  PlaceReelsRepository,
  SavedPlaceListItem,
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
  // 2.2.0 서버부터 내려옵니다.
  // TODO(범주 API): 운영 서버 배포가 확인되면 필수 필드로 바꿉니다.
  categoryCode?: string | null;
  categoryName?: string | null;
  landLotAddress: string | null;
  roadAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  kakaoPlaceUrl: string | null;
  // 해외 장소 API(pipeline-version 1)부터 내려옵니다.
  // TODO(해외 장소 API): 운영 서버 배포가 확인되면 필수 필드로 바꿉니다.
  mapProvider?: string | null;
  countryCode?: string | null;
  placeUrl?: string | null;
  thumbnailUrl: string | null;
  lastSavedAt: string;
  // 담은 시각 오름차순이라 마지막이 가장 최근에 담은 폴더입니다.
  folderIds?: number[] | null;
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

function toSavedPlaceListItem(item: SavedPlaceResponse): SavedPlaceListItem {
  return {
    id: String(item.savedPlaceId),
    thumbnailUrl: item.thumbnailUrl,
    createdAt: item.lastSavedAt,
    lastSavedAt: item.lastSavedAt,
    folderIds: (item.folderIds ?? []).map(String),
    place: {
      id: String(item.placeId),
      name: item.name,
      category: item.category,
      categoryCode: item.categoryCode,
      categoryName: item.categoryName,
      sourceAddress: item.landLotAddress,
      address: item.landLotAddress,
      roadAddress: item.roadAddress,
      latitude: item.latitude,
      longitude: item.longitude,
      kakaoPlaceUrl: item.kakaoPlaceUrl,
      mapProvider: toMapProvider(item.mapProvider),
      countryCode: item.countryCode ?? null,
      placeUrl: item.placeUrl ?? item.kakaoPlaceUrl,
      thumbnailUrl: item.thumbnailUrl,
    },
  };
}

export const springSavedPlacesRepository: SavedPlacesRepository = {
  getSavedPlaces: () => withScreenError(async () => {
    const response = await client.request<{savedPlaces: SavedPlaceResponse[]}>(
      '/api/v1/saved-places',
    );
    return response.savedPlaces.map(toSavedPlaceListItem);
  }),
  // 목록과 같은 모양을 페이지 없이 한 번에 받습니다.
  searchSavedPlaces: query => withScreenError(async () => {
    const response = await client.request<{savedPlaces: SavedPlaceResponse[]}>(
      '/api/v1/saved-places/search',
      {query: {query}},
    );
    return response.savedPlaces.map(toSavedPlaceListItem);
  }),
  deleteSavedPlaces: savedPlaceIds => withScreenError(async () => {
    if (savedPlaceIds.length === 0) return;
    await client.request<void>('/api/v1/saved-places', {
      method: 'DELETE',
      query: {savedPlaceIds},
    });
  }),
};

export const springPlaceDetailRepository: PlaceDetailRepository = {
  getPlaceInfo: placeId => withScreenError(() =>
    client.request<PlaceDetailInfo>(
      `/api/v1/places/${encodeURIComponent(placeId)}/info`,
    ),
  ),
  getPlaceBlogs: placeId => withScreenError(async () => {
    const response = await client.request<{source: string; items: PlaceBlogPost[]}>(
      `/api/v1/places/${encodeURIComponent(placeId)}/blogs`,
    );
    return {source: response.source, posts: response.items};
  }),
};

export const springPlaceReelsRepository: PlaceReelsRepository = {
  getPlaceReels: placeId => withScreenError(async () => {
    const response = await client.request<{media: SavedPlaceMediaResponse[]}>(
      `/api/v1/places/${encodeURIComponent(placeId)}/media`,
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
