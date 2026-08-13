import { frontendInfoDomainMock } from './mocks';
import type {
  FrontendInfoDomain,
  InfoPlace,
  ProfileInfo,
  ReelInfo,
  SavedPlaceInfo,
  SavedPlaceListItem,
  SavedPlacesApiError,
  SavedPlacesRepository,
} from './types';

export async function getFrontendInfoDomain(): Promise<FrontendInfoDomain> {
  return Promise.resolve(frontendInfoDomainMock);
}

export async function getProfiles(): Promise<ProfileInfo[]> {
  return Promise.resolve(frontendInfoDomainMock.profiles);
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

export async function getPlaceReels(placeId: string): Promise<ReelInfo[]> {
  return Promise.resolve(
    frontendInfoDomainMock.reels.filter(reel => reel.placeId === placeId),
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

type SavedPlacesApiOptions = {
  baseUrl: string;
  /** Supabase 프로젝트의 공개 publishable key입니다. service_role key는 앱에 넣지 않습니다. */
  publishableKey?: string;
  getAccessToken?: () => Promise<string | null>;
  refreshSession?: () => Promise<boolean>;
};

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
