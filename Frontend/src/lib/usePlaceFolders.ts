import { useCallback, useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

import {
  DEFAULT_FOLDER_COLOR,
  getPlaceFolders,
  setPlaceFolders,
  type PlaceFolder,
} from './placeFolderStorage';

export const MAX_FOLDER_NAME_LENGTH = 15;
export const MAX_FOLDER_COUNT = 10;

// 지도와 보관함 상세처럼 같은 폴더 목록을 쓰는 화면끼리 변경을 바로 공유합니다.
const folderListeners = new Set<(folders: PlaceFolder[]) => void>();

export function usePlaceFolders(enabled = true) {
  const [folders, setFolders] = useState<PlaceFolder[]>([]);
  const foldersRef = useRef<PlaceFolder[]>([]);

  useEffect(() => {
    if (!enabled) return;

    let isMounted = true;
    (async () => {
      const storedFolders = await getPlaceFolders();
      if (!isMounted) return;
      foldersRef.current = storedFolders;
      setFolders(storedFolders);
    })();
    return () => {
      isMounted = false;
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    const listener = (nextFolders: PlaceFolder[]) => {
      foldersRef.current = nextFolders;
      setFolders(nextFolders);
    };
    folderListeners.add(listener);
    return () => {
      folderListeners.delete(listener);
    };
  }, [enabled]);

  const commit = useCallback((nextFolders: PlaceFolder[]) => {
    foldersRef.current = nextFolders;
    setFolders(nextFolders);
    setPlaceFolders(nextFolders);
    folderListeners.forEach(listener => listener(nextFolders));
  }, []);

  const createFolder = useCallback(
    (
      name: string,
      color: string = DEFAULT_FOLDER_COLOR,
      placeIds: string[] = [],
    ) => {
      const createdAt = new Date().toISOString();
      const folder: PlaceFolder = {
        id: uuidv4(),
        name: name.trim().slice(0, MAX_FOLDER_NAME_LENGTH),
        color,
        placeIds,
        placeAddedAt: Object.fromEntries(
          placeIds.map(placeId => [placeId, createdAt]),
        ),
        createdAt,
      };
      commit([...foldersRef.current, folder]);
      return folder;
    },
    [commit],
  );

  const updateFolder = useCallback(
    (folderId: string, name: string, color: string) =>
      commit(
        foldersRef.current.map(folder =>
          folder.id === folderId
            ? {
                ...folder,
                name: name.trim().slice(0, MAX_FOLDER_NAME_LENGTH),
                color,
              }
            : folder,
        ),
      ),
    [commit],
  );

  const deleteFolder = useCallback(
    (folderId: string) =>
      commit(foldersRef.current.filter(folder => folder.id !== folderId)),
    [commit],
  );

  // 한 장소를 여러 폴더에 담을 수 있으므로, 장소 기준으로 소속 폴더를 한 번에 바꿉니다.
  // 이미 담겨 있던 폴더는 담은 시각을 그대로 두고, 새로 담은 폴더만 지금 시각을 남깁니다.
  // TODO(폴더 API): 담은 시각은 서버가 기록하므로 placeAddedAt 처리를 지웁니다.
  const setPlaceFolderIds = useCallback(
    (placeId: string, folderIds: string[]) => {
      const addedAt = new Date().toISOString();
      commit(
        foldersRef.current.map(folder => {
          const contains = folder.placeIds.includes(placeId);
          const shouldContain = folderIds.includes(folder.id);
          if (contains === shouldContain) return folder;

          const restAddedAt = { ...folder.placeAddedAt };
          delete restAddedAt[placeId];
          return shouldContain
            ? {
                ...folder,
                placeIds: [...folder.placeIds, placeId],
                placeAddedAt: { ...restAddedAt, [placeId]: addedAt },
              }
            : {
                ...folder,
                placeIds: folder.placeIds.filter(id => id !== placeId),
                placeAddedAt: restAddedAt,
              };
        }),
      );
    },
    [commit],
  );

  return {
    folders,
    createFolder,
    updateFolder,
    deleteFolder,
    setPlaceFolderIds,
  };
}
