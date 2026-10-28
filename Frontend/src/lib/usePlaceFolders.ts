import { useCallback, useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

import { syncShareFolders, takeShareFolderDrafts } from './share-intent';

import {
  DEFAULT_FOLDER_COLOR,
  getPlaceFolders,
  setPlaceFolders,
  type PlaceFolder,
} from './placeFolderStorage';

export const MAX_FOLDER_NAME_LENGTH = 15;
export const MAX_FOLDER_COUNT = 10;

export function usePlaceFolders(enabled = true) {
  const [folders, setFolders] = useState<PlaceFolder[]>([]);
  const foldersRef = useRef<PlaceFolder[]>([]);

  useEffect(() => {
    if (!enabled) return;

    let isMounted = true;
    (async () => {
      const storedFolders = await getPlaceFolders();
      // 공유 확장에서 만든 폴더를 합칩니다(최대 개수 초과분은 버립니다).
      const drafts = await takeShareFolderDrafts();
      const known = new Set(storedFolders.map(folder => folder.id));
      const merged = [...storedFolders];
      for (const draft of drafts) {
        if (known.has(draft.id) || merged.length >= MAX_FOLDER_COUNT) continue;
        merged.push({
          id: draft.id,
          name: draft.name.trim().slice(0, MAX_FOLDER_NAME_LENGTH),
          color: draft.color,
          placeIds: [],
          createdAt: new Date().toISOString(),
        });
      }
      if (!isMounted) return;
      foldersRef.current = merged;
      setFolders(merged);
      if (merged.length !== storedFolders.length) setPlaceFolders(merged);
      syncShareFolders(merged);
    })();
    return () => {
      isMounted = false;
    };
  }, [enabled]);

  const commit = useCallback((nextFolders: PlaceFolder[]) => {
    foldersRef.current = nextFolders;
    setFolders(nextFolders);
    setPlaceFolders(nextFolders);
    syncShareFolders(nextFolders);
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
