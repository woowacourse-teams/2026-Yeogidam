import { createApiClient, type ApiClientOptions } from '../../lib/api/client';
import { toIdString } from '../../lib/api/values';
import { frontendInfoDomainMock } from './mocks';
import type {
  CurrentProfileRepository,
  PlaceReel,
  PlaceReelsRepository,
  ProfileApiError,
  ProfileInfo,
  SavedPlaceListItem,
  SavedPlacesRepository,
} from './types';

const PROFILE_SELECT = [
  'id',
  'nickname',
  'description',
  'avatar_url',
  'created_at',
  'updated_at',
].join(',');

type SupabaseApiOptions = {
  baseUrl: string;
  /** Supabase 프로젝트의 공개 publishable key입니다. service_role key는 앱에 넣지 않습니다. */
  publishableKey?: string;
  getAccessToken?: () => Promise<string | null>;
  getUserId?: () => Promise<string | null>;
  getProfileSeed?: () => Promise<{
    nickname?: string | null;
    description?: string | null;
    avatarUrl?: string | null;
  } | null>;
  refreshSession?: () => Promise<boolean>;
};

type ProfileApiOptions = SupabaseApiOptions;
type SavedPlacesApiOptions = ApiClientOptions;
type PlaceReelsApiOptions = SavedPlacesApiOptions;

const profileError = (
  errorCode: string,
  status: number | null,
  message: string,
  retryable: boolean,
): ProfileApiError => ({ status, errorCode, message, retryable });

function fallbackProfileError(status: number | null): ProfileApiError {
  if (status === 400)
    return profileError(
      'COMMON400_001',
      400,
      '요청 내용을 확인해주세요.',
      false,
    );
  if (status === 401)
    return profileError('AUTH401_001', 401, '로그인이 필요해요.', true);
  if (status === 403)
    return profileError(
      'AUTH403_001',
      403,
      '이 작업을 수행할 권한이 없어요.',
      false,
    );
  if (status !== null && status >= 500)
    return profileError(
      'DATA500_001',
      500,
      '데이터를 처리하지 못했어요. 잠시 후 다시 시도해주세요.',
      true,
    );
  return profileError(
    'CLIENT000_003',
    null,
    '응답을 처리하지 못했어요.',
    false,
  );
}

type SupabaseProfileResponse = {
  id: string;
  nickname: string | null;
  description: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

function toProfileInfo(profile: SupabaseProfileResponse): ProfileInfo {
  return {
    id: profile.id,
    nickname: profile.nickname,
    description: profile.description,
    avatarUrl: profile.avatar_url,
    createdAt: profile.created_at,
    updatedAt: profile.updated_at,
  };
}

function createProfileNotFoundError(): ProfileApiError {
  return profileError(
    'PROFILE404_001',
    null,
    '프로필 정보를 찾을 수 없어요. 다시 로그인해주세요.',
    false,
  );
}

type SupabaseProfileInsertRequest = {
  id: string;
  nickname?: string | null;
  description?: string | null;
  avatar_url?: string | null;
};

function toSupabaseProfileInsert(
  userId: string,
  seed: {
    nickname?: string | null;
    description?: string | null;
    avatarUrl?: string | null;
  } | null,
): SupabaseProfileInsertRequest {
  return {
    id: userId,
    ...(seed?.nickname !== undefined ? {nickname: seed.nickname} : {}),
    ...(seed?.description !== undefined
      ? {description: seed.description}
      : {}),
    ...(seed?.avatarUrl !== undefined ? {avatar_url: seed.avatarUrl} : {}),
  };
}

export function createSupabaseCurrentProfileRepository(
  options: ProfileApiOptions,
): CurrentProfileRepository {
  const createCurrentProfileOnce = async () => {
    if (!options.baseUrl) throw fallbackProfileError(null);

    const userId = await options.getUserId?.();

    if (!userId) {
      throw profileError('AUTH401_001', 401, '로그인이 필요해요.', true);
    }

    const token = await options.getAccessToken?.();
    const seed = (await options.getProfileSeed?.()) ?? null;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    let response: Response;
    try {
      response = await fetch(`${options.baseUrl.replace(/\/$/, '')}/rest/v1/profiles`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=representation',
          ...(options.publishableKey
            ? {apikey: options.publishableKey}
            : {}),
          ...(token ? {Authorization: `Bearer ${token}`} : {}),
        },
        body: JSON.stringify(toSupabaseProfileInsert(userId, seed)),
        signal: controller.signal,
      });
    } catch {
      throw controller.signal.aborted
        ? profileError(
            'CLIENT000_002',
            null,
            '응답이 늦어지고 있어요. 잠시 후 다시 시도해주세요.',
            true,
          )
        : profileError(
            'CLIENT000_001',
            null,
            '인터넷 연결을 확인해주세요.',
            true,
          );
    } finally {
      clearTimeout(timeoutId);
    }

    if (response.ok) {
      return;
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw fallbackProfileError(null);
    }

    const normalized = body as Partial<ProfileApiError>;
    const fallback = fallbackProfileError(response.status);
    throw {
      ...fallback,
      ...normalized,
      status: normalized.status ?? fallback.status,
    };
  };

  const getCurrentProfileOnce = async (): Promise<ProfileInfo> => {
    if (!options.baseUrl) throw fallbackProfileError(null);

    const userId = await options.getUserId?.();

    if (!userId) {
      throw profileError('AUTH401_001', 401, '로그인이 필요해요.', true);
    }

    const token = await options.getAccessToken?.();
    const query = [
      `id=eq.${encodeURIComponent(userId)}`,
      `select=${encodeURIComponent(PROFILE_SELECT)}`,
    ].join('&');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    let response: Response;
    try {
      response = await fetch(
        `${options.baseUrl.replace(/\/$/, '')}/rest/v1/profiles?${query}`,
        {
          headers: {
            Accept: 'application/json',
            ...(options.publishableKey
              ? { apikey: options.publishableKey }
              : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          signal: controller.signal,
        },
      );
    } catch {
      throw controller.signal.aborted
        ? profileError(
            'CLIENT000_002',
            null,
            '응답이 늦어지고 있어요. 잠시 후 다시 시도해주세요.',
            true,
          )
        : profileError(
            'CLIENT000_001',
            null,
            '인터넷 연결을 확인해주세요.',
            true,
          );
    } finally {
      clearTimeout(timeoutId);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw fallbackProfileError(null);
    }

    if (!response.ok) {
      const normalized = body as Partial<ProfileApiError>;
      const fallback = fallbackProfileError(response.status);
      throw {
        ...fallback,
        ...normalized,
        status: normalized.status ?? fallback.status,
      };
    }

    const currentProfile = (body as SupabaseProfileResponse[]).map(toProfileInfo)[0];

    if (!currentProfile) {
      throw createProfileNotFoundError();
    }

    return currentProfile;
  };

  return {
    async getCurrentProfile() {
      try {
        return await getCurrentProfileOnce();
      } catch (error) {
        if ((error as ProfileApiError).errorCode === 'PROFILE404_001') {
          await createCurrentProfileOnce();

          return getCurrentProfileOnce();
        }

        if (
          (error as ProfileApiError).errorCode === 'AUTH401_002' &&
          (await options.refreshSession?.())
        ) {
          return getCurrentProfileOnce();
        }

        throw error;
      }
    },
  };
}

export function createMockCurrentProfileRepository(): CurrentProfileRepository {
  return {
    async getCurrentProfile() {
      const currentProfile = frontendInfoDomainMock.profiles[0];

      if (!currentProfile) {
        throw createProfileNotFoundError();
      }

      return currentProfile;
    },
  };
}

let currentProfileRepository: CurrentProfileRepository =
  createMockCurrentProfileRepository();

export function configureCurrentProfileRepository(
  repository: CurrentProfileRepository,
) {
  currentProfileRepository = repository;
}

export function configureProfilesApi(options: ProfileApiOptions) {
  configureCurrentProfileRepository(
    createSupabaseCurrentProfileRepository(options),
  );
}

export function getCurrentProfile(): Promise<ProfileInfo> {
  return currentProfileRepository.getCurrentProfile();
}

/** 카드에 쓰는 짧은 주소입니다. 서버가 내리지 않아 지번 주소의 앞 두 어절로 만듭니다. */
function toShortAddress(landLotAddress: string) {
  return landLotAddress.split(/\s+/).filter(Boolean).slice(0, 2).join(' ');
}

type ServerSavedPlaceResponse = {
  savedPlaceId: number;
  placeId: number;
  name: string;
  category: string | null;
  landLotAddress: string;
  roadAddress: string | null;
  latitude: number;
  longitude: number;
  kakaoPlaceUrl: string | null;
  telephone: string | null;
  thumbnailUrl: string | null;
  thumbnailSource: string | null;
  lastSavedAt: string;
};

type ServerSavedPlaceResponses = {
  savedPlaces: ServerSavedPlaceResponse[];
};

/** 서버 JSON을 앱의 `SavedPlaceListItem` 계약으로 바꿉니다. */
function toSavedPlaceListItem(
  item: ServerSavedPlaceResponse,
): SavedPlaceListItem {
  return {
    id: toIdString(item.savedPlaceId),
    lastSavedAt: item.lastSavedAt,
    place: {
      id: toIdString(item.placeId),
      name: item.name,
      category: item.category,
      landLotAddress: item.landLotAddress,
      roadAddress: item.roadAddress,
      shortAddress: toShortAddress(item.landLotAddress),
      latitude: item.latitude,
      longitude: item.longitude,
      kakaoPlaceUrl: item.kakaoPlaceUrl,
      telephone: item.telephone,
      thumbnailUrl: item.thumbnailUrl,
      thumbnailSource: item.thumbnailSource,
    },
  };
}

/** 서버 보관함 API 구현체입니다. 실패는 `ApiError`로 던집니다. */
export function createServerSavedPlacesRepository(
  options: SavedPlacesApiOptions,
): SavedPlacesRepository {
  const request = createApiClient(options);

  return {
    async getSavedPlaces() {
      const body = (await request(
        '/api/v1/saved-places',
      )) as ServerSavedPlaceResponses;

      return body.savedPlaces.map(toSavedPlaceListItem);
    },
    async deleteSavedPlaces(savedPlaceIds) {
      // 빈 목록은 서버가 PLACE400_001로 거절하므로 보내지 않습니다.
      if (savedPlaceIds.length === 0) {
        return;
      }

      await request('/api/v1/saved-places', {
        method: 'DELETE',
        query: { savedPlaceIds: savedPlaceIds.join(',') },
      });
    },
  };
}

/** API 주소가 아직 연결되지 않은 개발 화면용 구현체입니다. */
export function createMockSavedPlacesRepository(): SavedPlacesRepository {
  return {
    async getSavedPlaces() {
      return frontendInfoDomainMock.savedPlaces
        .slice()
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .flatMap(savedPlace => {
          const place = frontendInfoDomainMock.places.find(
            candidate => candidate.id === savedPlace.placeId,
          );

          return place
            ? [
                {
                  id: savedPlace.id,
                  lastSavedAt: savedPlace.lastSavedAt ?? savedPlace.createdAt,
                  place: {
                    ...place,
                    shortAddress: toShortAddress(place.landLotAddress),
                  },
                },
              ]
            : [];
        });
    },
    async deleteSavedPlaces(savedPlaceIds) {
      const idsToDelete = new Set(savedPlaceIds);
      for (let index = frontendInfoDomainMock.savedPlaces.length - 1; index >= 0; index -= 1) {
        if (idsToDelete.has(frontendInfoDomainMock.savedPlaces[index].id)) {
          frontendInfoDomainMock.savedPlaces.splice(index, 1);
        }
      }
    },
  };
}

// 서버 설정 전에도 저장됨 화면은 기존 info 목 데이터로 표시합니다.
let savedPlacesRepository: SavedPlacesRepository =
  createMockSavedPlacesRepository();

export function configureSavedPlacesRepository(
  repository: SavedPlacesRepository,
) {
  savedPlacesRepository = repository;
}

/** 앱 시작 시 서버 구현체를 등록합니다. */
export function configureSavedPlacesApi(options: SavedPlacesApiOptions) {
  configureSavedPlacesRepository(createServerSavedPlacesRepository(options));
}

/** 화면은 이 함수만 사용하며 Supabase/자체 서버를 알 필요가 없습니다. */
export function getSavedPlaces(): Promise<SavedPlaceListItem[]> {
  return savedPlacesRepository.getSavedPlaces();
}

export function deleteSavedPlaces(savedPlaceIds: string[]): Promise<void> {
  return savedPlacesRepository.deleteSavedPlaces(savedPlaceIds);
}

type ServerSavedPlaceMediaResponse = {
  sharedMediaId: number;
  thumbnailUrl: string | null;
  author: string | null;
  caption: string | null;
  sharedUrl: string;
  createdAt: string;
};

type ServerSavedPlaceMediaResponses = {
  media: ServerSavedPlaceMediaResponse[];
};

function toPlaceReel(media: ServerSavedPlaceMediaResponse): PlaceReel {
  return {
    id: toIdString(media.sharedMediaId),
    instagramUrl: media.sharedUrl,
    instagramAuthorUsername: media.author,
    instagramDescription: media.caption,
    instagramThumbnailUrl: media.thumbnailUrl,
    createdAt: media.createdAt,
  };
}

/** 서버 장소별 릴스 API 구현체입니다. 보관함 항목 id로 릴스를 한 번에 읽습니다. */
export function createServerPlaceReelsRepository(
  options: PlaceReelsApiOptions,
): PlaceReelsRepository {
  const request = createApiClient(options);

  return {
    async getPlaceReels(savedPlaceId) {
      const body = (await request(
        `/api/v1/saved-places/${encodeURIComponent(savedPlaceId)}/media`,
      )) as ServerSavedPlaceMediaResponses;

      return body.media.map(toPlaceReel);
    },
  };
}

export function createMockPlaceReelsRepository(): PlaceReelsRepository {
  return {
    async getPlaceReels(savedPlaceId) {
      const savedPlace = frontendInfoDomainMock.savedPlaces.find(
        candidate => candidate.id === savedPlaceId,
      );

      if (!savedPlace) {
        return [];
      }

      return frontendInfoDomainMock.reels
        .filter(
          reel =>
            reel.placeId === savedPlace.placeId &&
            reel.processingStatus === 'COMPLETED',
        )
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .map(reel => ({
          id: reel.id,
          instagramUrl: reel.instagramUrl,
          instagramAuthorUsername: reel.instagramAuthorUsername ?? null,
          instagramDescription: reel.instagramDescription ?? null,
          instagramThumbnailUrl: reel.instagramThumbnailUrl,
          createdAt: reel.createdAt,
        }));
    },
  };
}

let placeReelsRepository: PlaceReelsRepository =
  createMockPlaceReelsRepository();

/**
 * 화면은 이 repository 계약만 사용합니다. 자체 서버로 전환할 때는
 * `configurePlaceReelsRepository({getPlaceReels: ...})`만 교체하면 됩니다.
 */
export function configurePlaceReelsRepository(
  repository: PlaceReelsRepository,
) {
  placeReelsRepository = repository;
}

/** 앱 시작 시 서버 구현체를 등록합니다. */
export function configurePlaceReelsApi(options: PlaceReelsApiOptions) {
  configurePlaceReelsRepository(createServerPlaceReelsRepository(options));
}

export function getPlaceReels(savedPlaceId: string): Promise<PlaceReel[]> {
  return placeReelsRepository.getPlaceReels(savedPlaceId);
}
