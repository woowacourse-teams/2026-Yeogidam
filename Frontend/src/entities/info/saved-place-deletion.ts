import {
  TIMEOUT_ERROR,
  normalizeScreenApiError,
  type ScreenApiError,
} from '../../lib/api/screen-error';
import {deleteSavedPlaces, getSavedPlaces} from './api';
import {removeFromSavedPlacesCache} from './saved-places-cache';

/**
 * 상세와 지도에서 저장 장소 하나를 지웁니다. 응답이 늦어 시간 초과로 실패하면 목록을 다시 읽어 그 장소가 없을 때 지운 것으로 보고,
 * 지웠으면 보관함 캐시에서도 빼서 보관함으로 돌아갔을 때 지운 장소가 되살아나지 않게 합니다.
 * 지웠다고 확인하지 못했으면(지우기 실패, 시간 초과 뒤 목록에 남아 있음, 다시 읽기 실패) 화면 오류 계약으로 맞춘 처음 오류를 던집니다.
 * 보관함 편집은 시간 초과를 화면 목록을 다시 읽어 확인하므로 이 함수를 쓰지 않습니다.
 */
export async function deleteSavedPlaceAndRemoveFromCache(savedPlaceId: string): Promise<void> {
  try {
    await deleteSavedPlaces([savedPlaceId]);
  } catch (error) {
    const apiError = normalizeScreenApiError(error);
    if (!(await isDeletedDespiteTimeout(apiError, savedPlaceId))) {
      throw apiError;
    }
  }
  removeFromSavedPlacesCache(cached => cached.savedPlaceId === savedPlaceId);
}

async function isDeletedDespiteTimeout(
  error: ScreenApiError,
  savedPlaceId: string,
): Promise<boolean> {
  if (error.errorCode !== TIMEOUT_ERROR.errorCode) return false;
  try {
    const savedPlaces = await getSavedPlaces();
    return !savedPlaces.some(savedPlace => savedPlace.id === savedPlaceId);
  } catch {
    // 다시 읽지 못하면 지웠는지 모르므로, 처음의 시간 초과 오류를 보여 사용자가 다시 시도하게 합니다.
    return false;
  }
}
