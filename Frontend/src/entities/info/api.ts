import { frontendInfoDomainMock } from './mocks';
import type {
  CurrentProfileRepository,
  FrontendInfoDomain,
  InfoPlace,
  PlaceReel,
  PlaceReelsApiError,
  PlaceReelsRepository,
  ProfileApiError,
  ProfileInfo,
  SavedPlaceInfo,
  SavedPlaceListItem,
  SavedPlacesApiError,
  SavedPlacesRepository,
  UpdateCurrentProfileInput,
} from './types';

export async function getFrontendInfoDomain(): Promise<FrontendInfoDomain> {
  return Promise.resolve(frontendInfoDomainMock);
}

export async function getInfoPlaces(): Promise<InfoPlace[]> {
  return Promise.resolve(frontendInfoDomainMock.places);
}

export async function getPlaceInfo(
  placeId: string,
): Promise<InfoPlace | undefined> {
  return Promise.resolve(
    frontendInfoDomainMock.places.find(place => place.id === placeId),
  );
}

export async function getUserSavedPlaces(
  userId: string,
): Promise<SavedPlaceInfo[]> {
  return Promise.resolve(
    frontendInfoDomainMock.savedPlaces.filter(
      savedPlace => savedPlace.userId === userId,
    ),
  );
}

const SAVED_PLACES_SELECT = [
  'id',
  'thumbnail_url',
  'created_at',
  'place:places(id,name,category,source_address,road_address,address,latitude,longitude,kakao_place_url,thumbnail_url,photo_attribution)',
].join(',');

const PROFILE_SELECT = [
  'id',
  'nickname',
  'description',
  'avatar_url',
  'created_at',
  'updated_at',
].join(',');

const PLACE_REELS_SELECT = [
  'id',
  'instagram_url',
  'instagram_author_username',
  'instagram_thumbnail_url',
  'created_at',
  'reel_places!inner(place_id)',
].join(',');

type SupabaseApiOptions = {
  baseUrl: string;
  /** Supabase 프로젝트의 공개 publishable key입니다. service_role key는 앱에 넣지 않습니다. */
  publishableKey?: string;
  getAccessToken?: () => Promise<string | null>;
  getUserId?: () => Promise<string | null>;
  refreshSession?: () => Promise<boolean>;
};

type ProfileApiOptions = SupabaseApiOptions;
type SavedPlacesApiOptions = SupabaseApiOptions;
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

type SupabaseProfilePatchRequest = {
  nickname?: string;
  description?: string;
  avatar_url?: string | null;
};

function toSupabaseProfilePatch(
  input: UpdateCurrentProfileInput,
): SupabaseProfilePatchRequest {
  return {
    ...(input.nickname !== undefined ? {nickname: input.nickname} : {}),
    ...(input.description !== undefined
      ? {description: input.description}
      : {}),
    ...(input.avatarUrl !== undefined
      ? {avatar_url: input.avatarUrl}
      : {}),
  };
}

function doesProfileMatchPatch(
  profile: ProfileInfo,
  patch: UpdateCurrentProfileInput,
) {
  return (
    (patch.nickname === undefined || (profile.nickname ?? '') === patch.nickname) &&
    (patch.description === undefined ||
      (profile.description ?? '') === patch.description) &&
    (patch.avatarUrl === undefined || (profile.avatarUrl ?? null) === patch.avatarUrl)
  );
}

export function createSupabaseCurrentProfileRepository(
  options: ProfileApiOptions,
): CurrentProfileRepository {
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
        if (
          (error as ProfileApiError).errorCode === 'AUTH401_002' &&
          (await options.refreshSession?.())
        ) {
          return getCurrentProfileOnce();
        }

        throw error;
      }
    },
    async updateCurrentProfile(input) {
      const updateCurrentProfileOnce = async (): Promise<ProfileInfo> => {
        if (!options.baseUrl) throw fallbackProfileError(null);

        const userId = await options.getUserId?.();

        if (!userId) {
          throw profileError('AUTH401_001', 401, '로그인이 필요해요.', true);
        }

        if (Object.keys(input).length === 0) {
          return getCurrentProfileOnce();
        }

        const token = await options.getAccessToken?.();
        const query = `id=eq.${encodeURIComponent(userId)}`;
        const patch = toSupabaseProfilePatch(input);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        let response: Response;
        try {
          response = await fetch(
            `${options.baseUrl.replace(/\/$/, '')}/rest/v1/profiles?${query}`,
            {
              method: 'PATCH',
              headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                Prefer: 'return=representation',
                ...(options.publishableKey
                  ? {apikey: options.publishableKey}
                  : {}),
                ...(token ? {Authorization: `Bearer ${token}`} : {}),
              },
              body: JSON.stringify(patch),
              signal: controller.signal,
            },
          );
        } catch {
          if (controller.signal.aborted) {
            try {
              const refreshedProfile = await getCurrentProfileOnce();

              if (doesProfileMatchPatch(refreshedProfile, input)) {
                return refreshedProfile;
              }
            } catch {
              // Keep the original timeout error when verification also fails.
            }

            throw profileError(
              'CLIENT000_002',
              null,
              '응답이 늦어지고 있어요. 잠시 후 다시 시도해주세요.',
              true,
            );
          }

          throw profileError(
            'CLIENT000_001',
            null,
            '인터넷 연결을 확인해주세요.',
            true,
          );
        } finally {
          clearTimeout(timeoutId);
        }

        let body: unknown;

        if (response.status !== 204) {
          try {
            body = await response.json();
          } catch {
            throw fallbackProfileError(null);
          }
        }

        if (!response.ok) {
          const normalized = (body ?? {}) as Partial<ProfileApiError>;
          const fallback = fallbackProfileError(response.status);
          throw {
            ...fallback,
            ...normalized,
            status: normalized.status ?? fallback.status,
          };
        }

        if (response.status === 204) {
          return getCurrentProfileOnce();
        }

        const updatedProfile = (body as SupabaseProfileResponse[]).map(toProfileInfo)[0];

        if (updatedProfile) {
          return updatedProfile;
        }

        return getCurrentProfileOnce();
      };

      try {
        return await updateCurrentProfileOnce();
      } catch (error) {
        if (
          (error as ProfileApiError).errorCode === 'AUTH401_002' &&
          (await options.refreshSession?.())
        ) {
          return updateCurrentProfileOnce();
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
    async updateCurrentProfile(input) {
      const currentProfile = frontendInfoDomainMock.profiles[0];

      if (!currentProfile) {
        throw createProfileNotFoundError();
      }

      const nextProfile: ProfileInfo = {
        ...currentProfile,
        ...(input.nickname !== undefined ? {nickname: input.nickname} : {}),
        ...(input.description !== undefined
          ? {description: input.description}
          : {}),
        ...(input.avatarUrl !== undefined ? {avatarUrl: input.avatarUrl} : {}),
        updatedAt: new Date().toISOString(),
      };

      frontendInfoDomainMock.profiles[0] = nextProfile;

      return nextProfile;
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

export function updateCurrentProfile(
  input: UpdateCurrentProfileInput,
): Promise<ProfileInfo> {
  return currentProfileRepository.updateCurrentProfile(input);
}

export async function getProfiles(): Promise<ProfileInfo[]> {
  return [await getCurrentProfile()];
}

const savedPlacesError = (
  errorCode: string,
  status: number | null,
  message: string,
  retryable: boolean,
): SavedPlacesApiError => ({ status, errorCode, message, retryable });

function fallbackSavedPlacesError(status: number | null) {
  if (status === 400)
    return savedPlacesError(
      'COMMON400_001',
      400,
      '요청 내용을 확인해주세요.',
      false,
    );
  if (status === 401)
    return savedPlacesError('AUTH401_001', 401, '로그인이 필요해요.', true);
  if (status === 403)
    return savedPlacesError(
      'AUTH403_001',
      403,
      '이 작업을 수행할 권한이 없어요.',
      false,
    );
  if (status !== null && status >= 500)
    return savedPlacesError(
      'DATA500_001',
      500,
      '데이터를 처리하지 못했어요. 잠시 후 다시 시도해주세요.',
      true,
    );
  return savedPlacesError(
    'CLIENT000_003',
    null,
    '응답을 처리하지 못했어요.',
    false,
  );
}

type SupabaseSavedPlaceResponse = {
  id: string;
  thumbnail_url: string | null;
  created_at: string;
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
  };
};

/** Supabase 전용 JSON을 앱의 `SavedPlaceListItem` 계약으로 바꿉니다. */
function toSavedPlaceListItem(
  item: SupabaseSavedPlaceResponse,
): SavedPlaceListItem {
  return {
    id: item.id,
    thumbnailUrl: item.thumbnail_url,
    createdAt: item.created_at,
    place: {
      id: item.place.id,
      name: item.place.name,
      category: item.place.category,
      sourceAddress: item.place.source_address,
      roadAddress: item.place.road_address,
      address: item.place.address,
      latitude: item.place.latitude,
      longitude: item.place.longitude,
      kakaoPlaceUrl: item.place.kakao_place_url,
      thumbnailUrl: item.place.thumbnail_url,
      photoAttribution: item.place.photo_attribution,
    },
  };
}

/**
 * 현재 Data API 구현체입니다. 향후 자체 서버가 생기면 이 구현체 대신
 * `configureSavedPlacesRepository({getSavedPlaces: ...})`만 교체합니다.
 */
export function createSupabaseSavedPlacesRepository(
  options: SavedPlacesApiOptions,
): SavedPlacesRepository {
  const getSavedPlacesOnce = async (): Promise<SavedPlaceListItem[]> => {
    if (!options.baseUrl) throw fallbackSavedPlacesError(null);

    const token = await options.getAccessToken?.();
    const query = `?select=${encodeURIComponent(
      SAVED_PLACES_SELECT,
    )}&order=created_at.desc`;
    let response: Response;
    try {
      response = await fetch(
        `${options.baseUrl.replace(/\/$/, '')}/rest/v1/saved_places${query}`,
        {
          headers: {
            Accept: 'application/json',
            ...(options.publishableKey
              ? { apikey: options.publishableKey }
              : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        },
      );
    } catch {
      throw savedPlacesError(
        'CLIENT000_001',
        null,
        '인터넷 연결을 확인해주세요.',
        true,
      );
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw fallbackSavedPlacesError(null);
    }
    if (!response.ok) {
      const normalized = body as Partial<SavedPlacesApiError>;
      const fallback = fallbackSavedPlacesError(response.status);
      throw {
        ...fallback,
        ...normalized,
        status: normalized.status ?? fallback.status,
      };
    }

    return (body as SupabaseSavedPlaceResponse[]).map(toSavedPlaceListItem);
  };

  return {
    async getSavedPlaces() {
      try {
        return await getSavedPlacesOnce();
      } catch (error) {
        if (
          (error as { errorCode?: string }).errorCode === 'AUTH401_002' &&
          (await options.refreshSession?.())
        ) {
          return getSavedPlacesOnce();
        }
        throw error;
      }
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
                  thumbnailUrl: savedPlace.thumbnailUrl,
                  createdAt: savedPlace.createdAt,
                  place,
                },
              ]
            : [];
        });
    },
  };
}

// Supabase 설정 전에도 저장됨 화면은 기존 info 목 데이터로 표시합니다.
let savedPlacesRepository: SavedPlacesRepository =
  createMockSavedPlacesRepository();

export function configureSavedPlacesRepository(
  repository: SavedPlacesRepository,
) {
  savedPlacesRepository = repository;
}

/** 앱 시작 시 현재 Supabase 구현체를 등록합니다. */
export function configureSavedPlacesApi(options: SavedPlacesApiOptions) {
  configureSavedPlacesRepository(createSupabaseSavedPlacesRepository(options));
}

/** 화면은 이 함수만 사용하며 Supabase/자체 서버를 알 필요가 없습니다. */
export function getSavedPlaces(): Promise<SavedPlaceListItem[]> {
  return savedPlacesRepository.getSavedPlaces();
}

type SupabasePlaceReelResponse = {
  id: string;
  instagram_url: string;
  instagram_author_username: string | null;
  instagram_thumbnail_url: string | null;
  created_at: string;
};

const placeReelsError = (
  errorCode: string,
  status: number | null,
  message: string,
  retryable: boolean,
): PlaceReelsApiError => ({ status, errorCode, message, retryable });

function fallbackPlaceReelsError(status: number | null): PlaceReelsApiError {
  if (status === 400)
    return placeReelsError(
      'COMMON400_001',
      400,
      '요청 내용을 확인해주세요.',
      false,
    );
  if (status === 401)
    return placeReelsError('AUTH401_001', 401, '로그인이 필요해요.', true);
  if (status === 403)
    return placeReelsError(
      'AUTH403_001',
      403,
      '이 작업을 수행할 권한이 없어요.',
      false,
    );
  if (status !== null && status >= 500)
    return placeReelsError(
      'DATA500_001',
      500,
      '데이터를 처리하지 못했어요. 잠시 후 다시 시도해주세요.',
      true,
    );
  return placeReelsError(
    'CLIENT000_003',
    null,
    '응답을 처리하지 못했어요.',
    false,
  );
}

function toPlaceReel(reel: SupabasePlaceReelResponse): PlaceReel {
  return {
    id: reel.id,
    instagramUrl: reel.instagram_url,
    instagramAuthorUsername: reel.instagram_author_username,
    instagramThumbnailUrl: reel.instagram_thumbnail_url,
    createdAt: reel.created_at,
  };
}

export function createSupabasePlaceReelsRepository(
  options: PlaceReelsApiOptions,
): PlaceReelsRepository {
  const getPlaceReelsOnce = async (placeId: string): Promise<PlaceReel[]> => {
    if (!options.baseUrl) throw fallbackPlaceReelsError(null);
    const token = await options.getAccessToken?.();
    const query = [
      `select=${encodeURIComponent(PLACE_REELS_SELECT)}`,
      'processing_status=eq.COMPLETED',
      `reel_places.place_id=eq.${encodeURIComponent(placeId)}`,
      'order=created_at.desc',
    ].join('&');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    let response: Response;
    try {
      response = await fetch(
        `${options.baseUrl.replace(/\/$/, '')}/rest/v1/reels?${query}`,
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
        ? placeReelsError(
            'CLIENT000_002',
            null,
            '응답이 늦어지고 있어요. 잠시 후 다시 시도해주세요.',
            true,
          )
        : placeReelsError(
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
      throw fallbackPlaceReelsError(null);
    }
    if (!response.ok) {
      const normalized = body as Partial<PlaceReelsApiError>;
      const fallback = fallbackPlaceReelsError(response.status);
      throw {
        ...fallback,
        ...normalized,
        status: normalized.status ?? fallback.status,
      };
    }
    return (body as SupabasePlaceReelResponse[]).map(toPlaceReel);
  };

  return {
    async getPlaceReels(placeId) {
      try {
        return await getPlaceReelsOnce(placeId);
      } catch (error) {
        if (
          (error as PlaceReelsApiError).errorCode === 'AUTH401_002' &&
          (await options.refreshSession?.())
        ) {
          return getPlaceReelsOnce(placeId);
        }
        throw error;
      }
    },
  };
}

export function createMockPlaceReelsRepository(): PlaceReelsRepository {
  return {
    async getPlaceReels(placeId) {
      return frontendInfoDomainMock.reels
        .filter(
          reel =>
            reel.placeId === placeId && reel.processingStatus === 'COMPLETED',
        )
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .map(reel => ({
          id: reel.id,
          instagramUrl: reel.instagramUrl,
          instagramAuthorUsername: reel.instagramAuthorUsername ?? null,
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

/** 앱 시작 시 Supabase 구현체를 등록합니다. */
export function configurePlaceReelsApi(options: PlaceReelsApiOptions) {
  configurePlaceReelsRepository(createSupabasePlaceReelsRepository(options));
}

export function getPlaceReels(placeId: string): Promise<PlaceReel[]> {
  return placeReelsRepository.getPlaceReels(placeId);
}
