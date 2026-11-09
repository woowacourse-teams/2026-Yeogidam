type SavedPlaceChange = {placeId: string; savedPlaceId: string | null};
type SavedPlaceListener = (change: SavedPlaceChange) => void;

const listeners = new Set<SavedPlaceListener>();

/** 장소 상세에서 북마크가 바뀐 것을 뒤에 유지된 화면(게시물 상세 등)에 알립니다. */
export function notifySavedPlaceChanged(change: SavedPlaceChange) {
  listeners.forEach(listener => listener(change));
}

export function subscribeSavedPlaceChanged(listener: SavedPlaceListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
