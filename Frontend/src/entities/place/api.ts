import {placeMocks} from './mocks';
import type {Place} from './types';
import type {SavedPlaceListItem} from '../info/types';

export async function getPlaces(): Promise<Place[]> {
  return Promise.resolve(placeMocks);
}

/** 저장 장소 조인 응답을 저장 목록과 지도에서 공통으로 쓰는 표시 모델로 변환합니다. */
export function toSavedPlaceDisplayPlace(savedPlace: SavedPlaceListItem): Place {
  const {place} = savedPlace;
  const imageUrl = savedPlace.thumbnailUrl ?? place.thumbnailUrl;
  const address = place.sourceAddress ?? place.roadAddress ?? place.address ?? '';

  return {
    id: place.id,
    savedPlaceId: savedPlace.id,
    name: place.name,
    category: place.category ?? undefined,
    address,
    fullAddress: address,
    latitude: place.latitude ?? undefined,
    longitude: place.longitude ?? undefined,
    placeUrl: place.kakaoPlaceUrl ?? undefined,
    image: imageUrl ? {uri: imageUrl} : undefined,
  };
}
