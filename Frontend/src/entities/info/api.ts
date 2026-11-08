import type {
  CurrentProfileRepository,
  PlaceReel,
  PlaceReelsRepository,
  ProfileInfo,
  SavedPlaceListItem,
  SavedPlacesRepository,
} from './types';

function unconfiguredRepositoryError(name: string): Error {
  return new Error(
    `${name} repository has not been configured. Call configureDataSources() before use.`,
  );
}

/* The app registers the Spring repositories at startup. Fail explicitly if a
 * screen tries to use one before that setup instead of returning sample data. */
let currentProfileRepository: CurrentProfileRepository = {
  async getCurrentProfile() {
    throw unconfiguredRepositoryError('Current profile');
  },
};

export function configureCurrentProfileRepository(
  repository: CurrentProfileRepository,
) {
  currentProfileRepository = repository;
}

export function getCurrentProfile(): Promise<ProfileInfo> {
  return currentProfileRepository.getCurrentProfile();
}

let savedPlacesRepository: SavedPlacesRepository = {
  async getSavedPlaces() {
    throw unconfiguredRepositoryError('Saved places');
  },
  async searchSavedPlaces() {
    throw unconfiguredRepositoryError('Saved places');
  },
  async deleteSavedPlaces() {
    throw unconfiguredRepositoryError('Saved places');
  },
};

export function configureSavedPlacesRepository(
  repository: SavedPlacesRepository,
) {
  savedPlacesRepository = repository;
}

export function getSavedPlaces(): Promise<SavedPlaceListItem[]> {
  return savedPlacesRepository.getSavedPlaces();
}

/** 서버가 이름·주소·카테고리에서 공백으로 나눈 단어를 모두 포함한 장소를 찾습니다. */
export function searchSavedPlaces(query: string): Promise<SavedPlaceListItem[]> {
  return savedPlacesRepository.searchSavedPlaces(query);
}

export function deleteSavedPlaces(savedPlaceIds: string[]): Promise<void> {
  return savedPlacesRepository.deleteSavedPlaces(savedPlaceIds);
}

let placeReelsRepository: PlaceReelsRepository = {
  async getPlaceReels() {
    throw unconfiguredRepositoryError('Place reels');
  },
};

export function configurePlaceReelsRepository(
  repository: PlaceReelsRepository,
) {
  placeReelsRepository = repository;
}

/** 장소 상세 게시물은 저장 여부와 관계없이 장소 ID로 조회합니다. */
export async function getPlaceReels(placeId: string): Promise<PlaceReel[]> {
  return placeReelsRepository.getPlaceReels(placeId);
}
