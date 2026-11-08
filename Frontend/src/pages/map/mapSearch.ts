import type {SavedPlaceListItem} from '../../entities/info/types';
import type {Place} from '../../entities/place/types';

/**
 * 서버 검색 결과 가운데 지금 지도에 보이는 장소(폴더·카테고리·좌표 조건을 거친 목록)만 고르고,
 * 서버가 준 순서(최근에 저장한 순)를 따릅니다.
 */
export function pickSearchedPlaces(candidates: Place[], results: SavedPlaceListItem[]) {
  const orderBySavedPlaceId = new Map(results.map((item, index) => [item.id, index]));
  return candidates
    .flatMap(place => {
      const order =
        place.savedPlaceId === undefined
          ? undefined
          : orderBySavedPlaceId.get(place.savedPlaceId);
      return order === undefined ? [] : [{place, order}];
    })
    .sort((a, b) => a.order - b.order)
    .map(({place}) => place);
}

/** 서버 검색을 쓸 수 없을 때 기기 안에서 이름·카테고리·주소로 거릅니다. 대소문자와 공백은 무시합니다. */
export function filterPlacesByKeyword(places: Place[], keyword: string) {
  const normalize = (value: string) =>
    value.toLocaleLowerCase('ko-KR').replace(/\s+/g, '');
  const normalizedKeyword = normalize(keyword);
  return places.filter(place =>
    [place.name, place.category, place.address, place.fullAddress]
      .filter((value): value is string => Boolean(value))
      .some(value => normalize(value).includes(normalizedKeyword)),
  );
}

/** 저장 장소 API는 401을 AUTH401_001로 바꿔 던집니다. */
export function isAuthenticationError(error: unknown) {
  const {status, errorCode} = error as {status?: number | null; errorCode?: string | null};
  return status === 401 || errorCode === 'AUTH401_001';
}
