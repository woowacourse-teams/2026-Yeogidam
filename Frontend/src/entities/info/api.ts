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

export function getPlaceReels(placeId: string): Promise<PlaceReel[]> {
  return placeReelsRepository.getPlaceReels(placeId);
}
