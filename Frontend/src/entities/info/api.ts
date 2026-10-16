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

/*
 * 화면은 아래 get/delete 함수만 사용합니다. 실제 구현체(Spring API)는
 * app/configureDataSources.ts에서 configure*Repository로 등록합니다.
 * 등록 전(테스트·개발 화면)에는 info 목 데이터를 씁니다.
 */

function createProfileNotFoundError(): ProfileApiError {
  return {
    status: null,
    errorCode: 'PROFILE404_001',
    message: '프로필 정보를 찾을 수 없어요. 다시 로그인해주세요.',
    retryable: false,
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

export function getCurrentProfile(): Promise<ProfileInfo> {
  return currentProfileRepository.getCurrentProfile();
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

let savedPlacesRepository: SavedPlacesRepository =
  createMockSavedPlacesRepository();

export function configureSavedPlacesRepository(
  repository: SavedPlacesRepository,
) {
  savedPlacesRepository = repository;
}

export function getSavedPlaces(): Promise<SavedPlaceListItem[]> {
  return savedPlacesRepository.getSavedPlaces();
}

export function deleteSavedPlaces(savedPlaceIds: string[]): Promise<void> {
  return savedPlacesRepository.deleteSavedPlaces(savedPlaceIds);
}

export function createMockPlaceReelsRepository(): PlaceReelsRepository {
  return {
    async getPlaceReels(savedPlaceId) {
      const placeId = frontendInfoDomainMock.savedPlaces.find(
        savedPlace => savedPlace.id === savedPlaceId,
      )?.placeId;
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
          instagramDescription: reel.instagramDescription ?? null,
          instagramThumbnailUrl: reel.instagramThumbnailUrl,
          createdAt: reel.createdAt,
        }));
    },
  };
}

let placeReelsRepository: PlaceReelsRepository =
  createMockPlaceReelsRepository();

export function configurePlaceReelsRepository(
  repository: PlaceReelsRepository,
) {
  placeReelsRepository = repository;
}

export function getPlaceReels(savedPlaceId: string): Promise<PlaceReel[]> {
  return placeReelsRepository.getPlaceReels(savedPlaceId);
}
