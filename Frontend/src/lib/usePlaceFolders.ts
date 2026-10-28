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
      const folder: PlaceFolder = {
        id: uuidv4(),
        name: name.trim().slice(0, MAX_FOLDER_NAME_LENGTH),
        color,
        placeIds,
        createdAt: new Date().toISOString(),
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
  const setPlaceFolderIds = useCallback(
    (placeId: string, folderIds: string[]) =>
      commit(
        foldersRef.current.map(folder => {
          const withoutPlace = folder.placeIds.filter(id => id !== placeId);
          return {
            ...folder,
            placeIds: folderIds.includes(folder.id)
              ? [...withoutPlace, placeId]
              : withoutPlace,
          };
        }),
      ),
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
