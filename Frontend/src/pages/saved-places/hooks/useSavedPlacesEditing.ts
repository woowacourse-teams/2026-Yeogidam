import {useCallback, useEffect, useState} from 'react';

import {deleteSavedPlaces} from '../../../entities/info/api';
import type {SavedPlacesApiError} from '../../../entities/info/types';
import type {Place} from '../../../entities/place/types';
import {
  INVALID_REQUEST_ERROR,
  TIMEOUT_ERROR,
  isLoginRequiredError,
  normalizeScreenApiError,
} from '../../../lib/api/screen-error';

/** 삭제 요청 상태입니다. 지우는 중에는 오류가 없습니다. */
type DeleteState =
  | {status: 'idle'}
  | {status: 'deleting'}
  | {status: 'error'; error: SavedPlacesApiError};

const IDLE: DeleteState = {status: 'idle'};
const DELETING: DeleteState = {status: 'deleting'};

/** 이전 삭제 오류만 치웁니다. 지우는 중이면 그대로 둡니다. */
const clearDeleteError = (current: DeleteState): DeleteState =>
  current.status === 'error' ? IDLE : current;

/** 삭제 요청이 끝났습니다. 그사이 오류가 남았으면 오류를 둡니다. */
const finishDeleting = (current: DeleteState): DeleteState =>
  current.status === 'deleting' ? IDLE : current;

type Options = {
  places: Place[];
  isGuest: boolean;
  removePlaces: (shouldRemove: (place: Place) => boolean) => void;
  /** 삭제 응답이 늦어 실패했을 때 실제로 지워졌는지 다시 읽어 확인합니다. */
  loadSavedPlaces: () => Promise<Place[] | null>;
  onEditModeChange?: (isEditing: boolean) => void;
  /** 비회원 시드 장소는 API 대신 이 콜백으로 지웁니다. */
  onDeleteGuestPlaces?: (placeIds: string[]) => void;
  /** 삭제가 로그인 필요 오류로 실패하면 부릅니다. */
  onAuthenticationRequired?: () => void;
};

/**
 * 보관함 편집 모드와 장소 선택, 고른 장소 삭제를 맡습니다.
 * 편집 모드가 바뀌면 onEditModeChange로 알리고, 화면을 떠날 때는 꺼졌다고 알립니다.
 * 삭제 확인 창(Alert)은 화면이 띄우고, 확인되면 deleteSelectedPlaces를 부릅니다.
 */
export function useSavedPlacesEditing({
  places,
  isGuest,
  removePlaces,
  loadSavedPlaces,
  onEditModeChange,
  onDeleteGuestPlaces,
  onAuthenticationRequired,
}: Options) {
  const [isEditing, setIsEditing] = useState(false);
  const [selectedPlaceIds, setSelectedPlaceIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [deleteState, setDeleteState] = useState<DeleteState>(IDLE);
  const isDeleting = deleteState.status === 'deleting';

  useEffect(() => {
    return () => onEditModeChange?.(false);
  }, [onEditModeChange]);

  /** 편집 버튼과 편집 취소 버튼이 부릅니다. */
  const toggleEditMode = useCallback(() => {
    const next = !isEditing;
    setIsEditing(next);
    setSelectedPlaceIds(new Set());
    // 편집을 켜고 끌 때 이전 삭제 오류 배너를 함께 치웁니다.
    setDeleteState(clearDeleteError);
    onEditModeChange?.(next);
  }, [isEditing, onEditModeChange]);

  /** 장소를 길게 누르면 부릅니다. */
  const enterEditMode = useCallback(() => {
    setIsEditing(true);
    setSelectedPlaceIds(new Set());
    setDeleteState(clearDeleteError);
    onEditModeChange?.(true);
  }, [onEditModeChange]);

  const togglePlaceSelection = useCallback((placeId: string) => {
    setSelectedPlaceIds(current => {
      const next = new Set(current);
      if (next.has(placeId)) {
        next.delete(placeId);
      } else {
        next.add(placeId);
      }
      return next;
    });
  }, []);

  /** 고른 장소를 지웁니다. 비회원은 API 대신 onDeleteGuestPlaces로 넘깁니다. */
  const deleteSelectedPlaces = useCallback(async () => {
    if (isDeleting || selectedPlaceIds.size === 0) {
      return;
    }

    if (isGuest) {
      removePlaces(place => selectedPlaceIds.has(place.id));
      onDeleteGuestPlaces?.([...selectedPlaceIds]);
      setSelectedPlaceIds(new Set());
      setIsEditing(false);
      onEditModeChange?.(false);
      return;
    }

    const savedPlaceIds = places.flatMap(place =>
      selectedPlaceIds.has(place.id) && place.savedPlaceId
        ? [place.savedPlaceId]
        : [],
    );
    if (savedPlaceIds.length !== selectedPlaceIds.size) {
      setDeleteState({status: 'error', error: {...INVALID_REQUEST_ERROR}});
      return;
    }

    setDeleteState(DELETING);
    try {
      await deleteSavedPlaces(savedPlaceIds);
      const deletedIds = new Set(savedPlaceIds);
      removePlaces(place => deletedIds.has(place.savedPlaceId ?? ''));
      setSelectedPlaceIds(new Set());
      setIsEditing(false);
      onEditModeChange?.(false);
    } catch (nextError) {
      const apiError = normalizeScreenApiError(nextError);
      if (apiError.errorCode === TIMEOUT_ERROR.errorCode) {
        const refreshedPlaces = await loadSavedPlaces();
        const deletedIds = new Set(savedPlaceIds);
        const isDeletionConfirmed =
          refreshedPlaces !== null &&
          refreshedPlaces.every(place => !deletedIds.has(place.savedPlaceId ?? ''));

        if (isDeletionConfirmed) {
          setSelectedPlaceIds(new Set());
          setIsEditing(false);
          onEditModeChange?.(false);
          return;
        }
      }

      setDeleteState({status: 'error', error: apiError});
      if (isLoginRequiredError(apiError)) {
        onAuthenticationRequired?.();
      }
    } finally {
      setDeleteState(finishDeleting);
    }
  }, [
    isDeleting,
    isGuest,
    loadSavedPlaces,
    onAuthenticationRequired,
    onDeleteGuestPlaces,
    onEditModeChange,
    places,
    removePlaces,
    selectedPlaceIds,
  ]);

  return {
    isEditing,
    selectedPlaceIds,
    isDeleting,
    deleteError: deleteState.status === 'error' ? deleteState.error : null,
    toggleEditMode,
    enterEditMode,
    togglePlaceSelection,
    deleteSelectedPlaces,
  };
}
