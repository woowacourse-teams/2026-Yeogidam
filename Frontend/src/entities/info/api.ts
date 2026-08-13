import { frontendInfoDomainMock } from './mocks';
import type {
  FrontendInfoDomain,
  InfoPlace,
  ProfileInfo,
  ReelInfo,
  SavedPlaceInfo,
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

export async function getPlaceInfo(placeId: string): Promise<InfoPlace | undefined> {
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
    frontendInfoDomainMock.savedPlaces.filter(savedPlace => savedPlace.userId === userId),
  );
}
