import type {PlaceReel} from '../info/types';
import type {HistoryReel, HistoryReelDetail} from '../content/types';
import type {Place} from '../place/types';

// Backend/src/main/resources/data-onboarding.sql (origin/be-dev, #317)의
// kakao_place_id, 이름, 주소, 좌표와 동일하게 유지합니다.
export const ONBOARDING_POST_URL = 'https://www.instagram.com/p/Db4gRWqkuUg/';

export const ONBOARDING_PLACES: Place[] = [
  {
    id: 'onboarding-1775568752',
    kakaoPlaceId: '1775568752',
    name: '윤숲 후르츠산도점',
    category: '음식점 > 카페',
    address: '서울 광진구 중곡동 628-7',
    fullAddress: '서울 광진구 면목로7길 8',
    latitude: 37.5595478228,
    longitude: 127.0772756026,
    placeUrl: 'https://place.map.kakao.com/1775568752',
    telephone: '010-7901-7239',
    image: require('../../assets/onboarding/place-1775568752.jpg'),
  },
  {
    id: 'onboarding-137070444',
    kakaoPlaceId: '137070444',
    name: '에프씨씨',
    category: '음식점 > 카페',
    address: '서울 광진구 중곡동 134-1',
    fullAddress: '서울 광진구 용마산로3길 88',
    latitude: 37.5571767489,
    longitude: 127.0833823915,
    placeUrl: 'https://place.map.kakao.com/137070444',
    telephone: '0507-1363-2949',
    image: require('../../assets/onboarding/place-137070444.jpg'),
  },
  {
    id: 'onboarding-337953507',
    kakaoPlaceId: '337953507',
    name: '책방고즈넉',
    category: '음식점 > 카페',
    address: '서울 광진구 군자동 467-15',
    fullAddress: '서울 광진구 동일로60길 41-13',
    latitude: 37.5578428719,
    longitude: 127.0762971247,
    placeUrl: 'https://place.map.kakao.com/337953507',
    telephone: '010-3524-2064',
    image: require('../../assets/onboarding/place-337953507.jpg'),
  },
  {
    id: 'onboarding-98016856',
    kakaoPlaceId: '98016856',
    name: '윤키',
    category: '음식점 > 카페 > 테마카페 > 디저트카페',
    address: '서울 광진구 중곡동 142-21',
    fullAddress: '서울 광진구 능동로38길 27',
    latitude: 37.5573429525,
    longitude: 127.0814902707,
    placeUrl: 'https://place.map.kakao.com/98016856',
    telephone: '0502-5553-0774',
    image: require('../../assets/onboarding/place-98016856.jpg'),
  },
  {
    id: 'onboarding-1107844606',
    kakaoPlaceId: '1107844606',
    name: '연필',
    category: '음식점 > 카페 > 커피전문점',
    address: '서울 광진구 군자동 49-17',
    fullAddress: '서울 광진구 면목로 12',
    latitude: 37.5552241288,
    longitude: 127.0755882553,
    placeUrl: 'https://place.map.kakao.com/1107844606',
    telephone: '0502-5552-2000',
    image: require('../../assets/onboarding/place-1107844606.jpg'),
  },
];

export const ONBOARDING_MAP_CENTER = {
  latitude: 37.557427,
  longitude: 127.078807,
};

const ONBOARDING_POST: PlaceReel = {
  id: 'onboarding-Db4gRWqkuUg',
  instagramUrl: ONBOARDING_POST_URL,
  instagramAuthorUsername: 'yeogidamm',
  instagramDescription: '군자역 디저트 맛집 5곳',
  instagramThumbnailUrl: null,
  createdAt: '2026-10-12T00:00:00+09:00',
};

export const ONBOARDING_PLACE_REELS: Record<string, PlaceReel[]> =
  Object.fromEntries(ONBOARDING_PLACES.map(place => [place.id, [ONBOARDING_POST]]));

export const ONBOARDING_HISTORY_REEL: HistoryReel = {
  id: ONBOARDING_POST.id,
  instagram_url: ONBOARDING_POST_URL,
  instagram_title: null,
  instagram_description: ONBOARDING_POST.instagramDescription ?? null,
  instagram_author_username: ONBOARDING_POST.instagramAuthorUsername,
  instagram_thumbnail_url: null,
  processing_status: 'COMPLETED',
  failure_reason: null,
  save_mode: 'url_input',
  created_at: ONBOARDING_POST.createdAt,
  local_thumbnail_source: require('../../assets/guide/practice-post.jpg'),
};

export const ONBOARDING_HISTORY_DETAIL: HistoryReelDetail = {
  ...ONBOARDING_HISTORY_REEL,
  extraction: {
    extraction_places: ONBOARDING_PLACES.map((place, position) => ({
      id: `onboarding-extraction-place-${place.kakaoPlaceId}`,
      position,
      place: {
        id: place.id,
        name: place.name,
        category: place.category ?? null,
        source_address: place.address,
        road_address: place.fullAddress,
        address: place.address,
        latitude: place.latitude ?? null,
        longitude: place.longitude ?? null,
        kakao_place_url: place.placeUrl ?? null,
        thumbnail_url: null,
        photo_attribution: null,
        local_thumbnail_source: place.image,
      },
    })),
  },
};

/** 비회원 체험용 예시 콘텐츠·장소 ID입니다. 분석 이벤트에서 제외할 때 사용합니다. */
export const ONBOARDING_SAMPLE_IDS: ReadonlySet<string> = new Set([
  ONBOARDING_HISTORY_REEL.id,
  ...ONBOARDING_PLACES.map(place => place.id),
]);

export function isOnboardingSampleId(id: string | null | undefined) {
  return id != null && ONBOARDING_SAMPLE_IDS.has(id);
}
