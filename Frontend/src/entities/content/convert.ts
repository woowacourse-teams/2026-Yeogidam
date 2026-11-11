import type {Place} from '../place/types';
import type {PlaceReel} from '../info/types';
import type {HistoryReel, HistoryReelPlace} from './types';

/**
 * 장소 상세의 게시물 카드를 게시물 상세 화면이 받는 공유 이력 모델로 바꿉니다.
 * 장소 상세에는 완료된 게시물만 나오므로 처리 상태는 항상 완료입니다.
 * `PlaceReel.id`는 공유 id(`sharedMediaId`)라서 게시물 상세의 장소 조회에 그대로 쓸 수 있습니다.
 */
export function placeReelToHistoryReel(reel: PlaceReel): HistoryReel {
  return {
    id: reel.id,
    instagram_url: reel.instagramUrl || null,
    instagram_title: null,
    instagram_description: reel.instagramDescription ?? null,
    instagram_author_username: reel.instagramAuthorUsername,
    instagram_thumbnail_url: reel.instagramThumbnailUrl ?? null,
    processing_status: 'COMPLETED',
    failure_reason: null,
    save_mode: null,
    created_at: reel.createdAt,
  };
}

/** 게시물 상세의 '찾은 장소' 항목을 장소 상세 화면이 받는 표시 모델로 바꿉니다. */
export function historyReelPlaceToPlace(item: HistoryReelPlace): Place | null {
  const place = item.place;
  if (!place) {
    return null;
  }
  const address = place.source_address ?? place.road_address ?? place.address ?? '';
  const image =
    place.local_thumbnail_source ??
    (place.thumbnail_url ? {uri: place.thumbnail_url} : undefined);

  return {
    id: place.id,
    savedPlaceId: item.savedPlaceId ?? undefined,
    name: place.name,
    category: place.category ?? undefined,
    categoryCode: place.category_code ?? undefined,
    categoryName: place.category_name ?? undefined,
    address,
    fullAddress: address,
    latitude: place.latitude ?? undefined,
    longitude: place.longitude ?? undefined,
    placeUrl: place.place_url ?? place.kakao_place_url ?? undefined,
    mapProvider: place.map_provider ?? undefined,
    countryCode: place.country_code ?? undefined,
    image,
  };
}
