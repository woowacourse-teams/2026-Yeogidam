import type {Place} from '../place/types';

// 상세 화면으로 가면 보관함 화면이 언마운트되므로, 돌아올 때 최신 조회를 기다리는 동안 지난 목록을
// 바로 보이기 위한 메모리 캐시입니다. 회원 한 사람의 목록이라 세션이 끝나면 비우고, 지우기에 성공하면
// 같은 자리에서 빼서 화면 상태와 어긋나지 않게 합니다. 채우기, 빼기, 비우기 규칙은 모두 여기에만 있습니다.
let cachedPlaces: Place[] | null = null;
// 비울 때마다 올려, 비우기 전에 보낸 조회가 늦게 끝나도 캐시를 다시 채우지 않게 합니다.
let generation = 0;

/** 지난 목록입니다. 아직 읽지 않았거나 세션이 끝나 비웠으면 null입니다. */
export function readSavedPlacesCache(): Place[] | null {
  return cachedPlaces;
}

/** 조회를 시작할 때 읽어 두었다가 writeSavedPlacesCache에 넘깁니다. */
export function getSavedPlacesCacheGeneration(): number {
  return generation;
}

/** 조회 결과를 채웁니다. 조회를 시작한 뒤 캐시가 비워졌으면(세대가 바뀌었으면) 쓰지 않습니다. */
export function writeSavedPlacesCache(places: Place[], generationAtRequest: number): void {
  if (generationAtRequest === generation) {
    cachedPlaces = places;
  }
}

/** 지우기에 성공한 장소를 캐시에서도 빼서, 다시 열 때 지운 장소가 되살아나지 않게 합니다. */
export function removeFromSavedPlacesCache(shouldRemove: (place: Place) => boolean): void {
  if (cachedPlaces === null) return;
  cachedPlaces = cachedPlaces.filter(place => !shouldRemove(place));
}

/**
 * 회원 세션이 끝나면(로그아웃, 탈퇴, 세션 만료) 부릅니다.
 * 다음에 보관함을 열면 이전 회원의 목록 대신 스켈레톤을 보이고 목록을 새로 읽습니다.
 */
export function clearSavedPlacesCache(): void {
  cachedPlaces = null;
  generation += 1;
}
