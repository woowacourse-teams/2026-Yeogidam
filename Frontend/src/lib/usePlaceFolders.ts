import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';

import {
  FOLDER_ERROR_CODES,
  createFolder as createFolderRequest,
  deleteFolder as deleteFolderRequest,
  getFolders,
  setSavedPlaceFolders,
  updateFolder as updateFolderRequest,
  type Folder,
} from '../entities/folder/api';
import {
  toFolderColorCode,
  toFolderColorHex,
} from '../entities/folder/color';
import { isScreenApiError } from './api/screen-error';
import {
  getFolderIdsByPlace,
  setFolderIdsByPlace,
  type FolderIdsByPlace,
  type PlaceFolder,
} from './placeFolderStorage';

export const MAX_FOLDER_NAME_LENGTH = 15;
export const MAX_FOLDER_COUNT = 10;

type FolderState = {
  folders: Folder[];
  folderIdsByPlace: FolderIdsByPlace;
};

// 지도와 장소 상세처럼 같은 폴더 목록을 쓰는 화면끼리 변경을 바로 공유합니다.
let sharedState: FolderState = { folders: [], folderIdsByPlace: {} };
let isMembershipLoaded = false;
let inFlightRefresh: Promise<void> | null = null;
const folderListeners = new Set<(state: FolderState) => void>();

function publish(next: FolderState) {
  sharedState = next;
  folderListeners.forEach(listener => listener(next));
}

// 지워졌거나 모르는 폴더 id는 장소의 소속에서 뺍니다.
function pruneFolderIds(
  folderIdsByPlace: FolderIdsByPlace,
  folders: Folder[],
): FolderIdsByPlace {
  const validIds = new Set(folders.map(folder => folder.id));
  return Object.fromEntries(
    Object.entries(folderIdsByPlace).flatMap(([placeId, folderIds]) => {
      const kept = folderIds.filter(id => validIds.has(id));
      return kept.length > 0 ? [[placeId, kept]] : [];
    }),
  );
}

async function refreshFolders() {
  if (inFlightRefresh) return inFlightRefresh;

  inFlightRefresh = (async () => {
    try {
      const folders = await getFolders();
      if (!isMembershipLoaded) {
        const stored = await getFolderIdsByPlace();
        isMembershipLoaded = true;
        sharedState = { ...sharedState, folderIdsByPlace: stored };
      }
      const folderIdsByPlace = pruneFolderIds(
        sharedState.folderIdsByPlace,
        folders,
      );
      publish({ folders, folderIdsByPlace });
      setFolderIdsByPlace(folderIdsByPlace);
    } catch {
      // 목록을 못 받아도 가지고 있던 폴더로 화면을 계속 쓸 수 있게 둡니다.
    } finally {
      inFlightRefresh = null;
    }
  })();
  return inFlightRefresh;
}

// 오류 문구는 앱이 정합니다. 이름 중복(409) 문구는 Figma에 없어 임시로 정했습니다.
function getFolderErrorMessage(error: unknown): string {
  const errorCode = isScreenApiError(error) ? error.errorCode : null;
  switch (errorCode) {
    case FOLDER_ERROR_CODES.duplicateName:
      return '같은 이름의 폴더가 이미 있어요.';
    case FOLDER_ERROR_CODES.limitExceeded:
      return `폴더는 최대 ${MAX_FOLDER_COUNT}개까지 만들 수 있어요.`;
    case FOLDER_ERROR_CODES.invalidName:
      return `폴더 이름은 1자 이상 ${MAX_FOLDER_NAME_LENGTH}자 이하로 입력해 주세요.`;
    case FOLDER_ERROR_CODES.notFound:
    case FOLDER_ERROR_CODES.assignmentTargetNotFound:
      return '폴더나 장소를 찾을 수 없어요. 목록을 새로 불러올게요.';
    default:
      return isScreenApiError(error) && error.retryable
        ? '네트워크 상태를 확인하고 다시 시도해 주세요.'
        : '폴더를 처리하지 못했어요. 잠시 후 다시 시도해 주세요.';
  }
}

function handleFolderError(error: unknown) {
  Alert.alert(getFolderErrorMessage(error));
  const errorCode = isScreenApiError(error) ? error.errorCode : null;
  if (
    errorCode === FOLDER_ERROR_CODES.notFound ||
    errorCode === FOLDER_ERROR_CODES.assignmentTargetNotFound
  ) {
    refreshFolders();
  }
}

function toPlaceFolder(folder: Folder, placeIds: string[]): PlaceFolder {
  return {
    id: folder.id,
    name: folder.name,
    color: toFolderColorHex(folder.color),
    placeIds,
  };
}

export function usePlaceFolders(enabled = true) {
  const [state, setState] = useState<FolderState>(sharedState);

  useEffect(() => {
    if (!enabled) return;

    folderListeners.add(setState);
    setState(sharedState);
    refreshFolders();
    return () => {
      folderListeners.delete(setState);
    };
  }, [enabled]);

  const folders = useMemo<PlaceFolder[]>(() => {
    if (!enabled) return [];

    const placeIdsByFolder = new Map<string, string[]>();
    for (const [placeId, folderIds] of Object.entries(state.folderIdsByPlace)) {
      for (const folderId of folderIds) {
        placeIdsByFolder.set(folderId, [
          ...(placeIdsByFolder.get(folderId) ?? []),
          placeId,
        ]);
      }
    }
    return state.folders.map(folder =>
      toPlaceFolder(folder, placeIdsByFolder.get(folder.id) ?? []),
    );
  }, [enabled, state]);

  const folderIdsByPlaceId = useMemo(
    () => new Map(enabled ? Object.entries(state.folderIdsByPlace) : []),
    [enabled, state.folderIdsByPlace],
  );

  /** 폴더를 만듭니다. 실패하면 안내를 띄우고 null을 돌려줍니다. */
  const createFolder = useCallback(
    async (name: string, color: string): Promise<PlaceFolder | null> => {
      try {
        const created = await createFolderRequest({
          name: name.trim(),
          color: toFolderColorCode(color),
        });
        publish({
          ...sharedState,
          folders: [...sharedState.folders, created],
        });
        return toPlaceFolder(created, []);
      } catch (error) {
        handleFolderError(error);
        return null;
      }
    },
    [],
  );

  /** 이름과 색을 바꿉니다. 실패하면 안내를 띄우고 false를 돌려줍니다. */
  const updateFolder = useCallback(
    async (folderId: string, name: string, color: string) => {
      const trimmedName = name.trim();
      const colorCode = toFolderColorCode(color);
      try {
        await updateFolderRequest(folderId, {
          name: trimmedName,
          color: colorCode,
        });
        publish({
          ...sharedState,
          folders: sharedState.folders.map(folder =>
            folder.id === folderId
              ? { ...folder, name: trimmedName, color: colorCode }
              : folder,
          ),
        });
        return true;
      } catch (error) {
        handleFolderError(error);
        return false;
      }
    },
    [],
  );

  /** 폴더를 지웁니다. 담겨 있던 장소는 보관함에 남습니다. */
  const deleteFolder = useCallback(async (folderId: string) => {
    try {
      await deleteFolderRequest(folderId);
      const remaining = sharedState.folders.filter(
        folder => folder.id !== folderId,
      );
      const folderIdsByPlace = pruneFolderIds(
        sharedState.folderIdsByPlace,
        remaining,
      );
      publish({ folders: remaining, folderIdsByPlace });
      setFolderIdsByPlace(folderIdsByPlace);
      return true;
    } catch (error) {
      handleFolderError(error);
      return false;
    }
  }, []);

  // 한 장소를 여러 폴더에 담을 수 있으므로, 장소 기준으로 소속 폴더를 한 번에 바꿉니다.
  // 이미 담겨 있던 폴더는 순서를 그대로 두고, 새로 담은 폴더만 뒤에 붙입니다.
  const setPlaceFolderIds = useCallback(
    async (
      place: { id: string; savedPlaceId?: string },
      folderIds: string[],
    ) => {
      if (!place.savedPlaceId) {
        Alert.alert('저장한 장소만 폴더에 담을 수 있어요.');
        return false;
      }

      try {
        await setSavedPlaceFolders(place.savedPlaceId, folderIds);
        const previous = sharedState.folderIdsByPlace[place.id] ?? [];
        const next = [
          ...previous.filter(id => folderIds.includes(id)),
          ...folderIds.filter(id => !previous.includes(id)),
        ];
        const folderIdsByPlace = { ...sharedState.folderIdsByPlace };
        if (next.length > 0) folderIdsByPlace[place.id] = next;
        else delete folderIdsByPlace[place.id];
        publish({ ...sharedState, folderIdsByPlace });
        setFolderIdsByPlace(folderIdsByPlace);
        return true;
      } catch (error) {
        handleFolderError(error);
        return false;
      }
    },
    [],
  );

  return {
    folders,
    folderIdsByPlaceId,
    createFolder,
    updateFolder,
    deleteFolder,
    setPlaceFolderIds,
  };
}
