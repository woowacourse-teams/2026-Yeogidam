import type {Place} from '../place/types';

// 보관함 목록의 메모리 캐시입니다. 보관함 화면은 상세나 다른 탭 뒤에 남아 있다가(App의 탭 유지) 다시 보일 때
// 세대가 바뀌었으면 캐시를 먼저 반영한 뒤 다시 읽고, 새로 그려질 때(앱을 다시 켜거나 회원이 바뀐 뒤)는 최신 조회를
// 기다리는 동안 캐시를 바로 보입니다. 회원 한 사람의 목록이라 세션이 끝나면 비우고, 다른 화면(상세, 지도 시트)에서
// 지우기에 성공하면 같은 자리에서 빼서 화면 상태와 어긋나지 않게 합니다. 비우기와 빼기는 둘 다 세대를 올리지만, 조회를
// 시작한 뒤 세대가 바뀐 까닭이 비우기인지(응답을 버리고 다시 읽지 않음) 빼기인지(다시 읽음)는 wasSavedPlacesCacheClearedSince로
// 가릅니다. 채우기, 빼기, 비우기 규칙은 모두 여기에만 있습니다.
let cachedPlaces: Place[] | null = null;
// 비우거나 뺄 때마다 올려, 그 전에 보낸 조회가 늦게 끝나도 캐시를 다시 채우지 않게 하고, 뒤에 남아 있던 보관함 화면이
// 다시 보일 때 캐시가 바뀌었는지 알게 합니다.
let generation = 0;
// 마지막으로 비운 세대입니다. 비운 적이 없으면 0입니다.
let clearedGeneration = 0;

/** 지난 목록입니다. 아직 읽지 않았거나 세션이 끝나 비웠으면 null입니다. */
export function readSavedPlacesCache(): Place[] | null {
  return cachedPlaces;
}

/** 조회를 시작할 때 읽어 두었다가 writeSavedPlacesCache와 wasSavedPlacesCacheClearedSince에 넘깁니다. */
export function getSavedPlacesCacheGeneration(): number {
  return generation;
}

/** 조회 결과를 채웁니다. 조회를 시작한 뒤 캐시를 비웠거나 장소를 뺐으면(세대가 바뀌었으면) 쓰지 않습니다. */
export function writeSavedPlacesCache(places: Place[], generationAtRequest: number): void {
  if (generationAtRequest === generation) {
    cachedPlaces = places;
  }
}

/**
 * 조회를 시작한 때의 세대 뒤에 캐시를 비운 적이 있으면 true입니다. 장소를 빼기만 했으면 false입니다.
 * 조회가 끝났을 때 세대가 바뀌어 있으면, 세션이 끝난 것(다시 읽으면 401)인지 지운 것(다시 읽어야 함)인지를 이것으로 가릅니다.
 */
export function wasSavedPlacesCacheClearedSince(generationAtRequest: number): boolean {
  return clearedGeneration > generationAtRequest;
}

/**
 * 지우기에 성공한 장소를 캐시에서도 빼서, 다시 열 때 지운 장소가 되살아나지 않게 합니다.
 * 지우기 전에 보낸 조회가 뒤늦게 끝나면 지운 장소를 다시 써 넣을 수 있으므로 세대도 올립니다.
 */
export function removeFromSavedPlacesCache(shouldRemove: (place: Place) => boolean): void {
  generation += 1;
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
  clearedGeneration = generation;
}
