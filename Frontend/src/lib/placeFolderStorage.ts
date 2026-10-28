import AsyncStorage from '@react-native-async-storage/async-storage';

import { FOLDER_COLOR_CODES, FOLDER_COLOR_HEX } from '../entities/folder/color';

// 폴더 자체는 서버가 갖고, 어느 장소가 어느 폴더에 담겼는지만 기기에 기억합니다.
// TODO(#474): saved-places 응답에 folderIds가 내려오면 이 저장소를 지웁니다.
const FOLDER_IDS_BY_PLACE_STORAGE_KEY = '@yeogidam/folder-ids-by-place';
// 폴더 API 도입 전에 폴더 전체를 기기에 저장하던 키입니다. 서버 폴더와 id가 달라 더는 읽지 않습니다.
const LEGACY_PLACE_FOLDERS_STORAGE_KEY = '@yeogidam/place-folders';

// 폴더 색상은 지도 핀 색으로도 쓰입니다. 서버 색 코드 7종만 쓰고, 첫 번째 색이 기본값입니다.
// 지도 기본 핀 색(DEFAULT_PIN_COLOR)은 폴더 색으로 고를 수 없습니다.
export const FOLDER_COLORS = FOLDER_COLOR_CODES.map(code => FOLDER_COLOR_HEX[code]);
export const DEFAULT_FOLDER_COLOR = FOLDER_COLORS[0];

// 새 폴더가 기존 폴더와 다른 색으로 시작하도록, 아직 쓰지 않은 색을 먼저 고릅니다.
export function getNextFolderColor(folders: Pick<PlaceFolder, 'color'>[]) {
  const usedColors = new Set(folders.map(folder => folder.color));
  return (
    FOLDER_COLORS.find(color => !usedColors.has(color)) ??
    FOLDER_COLORS[folders.length % FOLDER_COLORS.length]
  );
}

export type PlaceFolder = {
  id: string;
  name: string;
  // 서버 색 코드를 그릴 hex로 바꾼 값입니다.
  color: string;
  placeIds: string[];
};

/** 장소 id마다 담긴 폴더 id입니다. 담은 순서대로라 마지막이 가장 최근에 담은 폴더입니다. */
export type FolderIdsByPlace = Record<string, string[]>;

export async function getFolderIdsByPlace(): Promise<FolderIdsByPlace> {
  AsyncStorage.removeItem(LEGACY_PLACE_FOLDERS_STORAGE_KEY).catch(() => {});
  try {
    const storedValue = await AsyncStorage.getItem(
      FOLDER_IDS_BY_PLACE_STORAGE_KEY,
    );
    if (!storedValue) return {};

    const parsedValue = JSON.parse(storedValue);
    if (!parsedValue || typeof parsedValue !== 'object') return {};
    return Object.fromEntries(
      Object.entries(parsedValue).flatMap(([placeId, folderIds]) =>
        Array.isArray(folderIds) &&
        folderIds.every(id => typeof id === 'string')
          ? [[placeId, folderIds]]
          : [],
      ),
    );
  } catch {
    return {};
  }
}

export async function setFolderIdsByPlace(
  folderIdsByPlace: FolderIdsByPlace,
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      FOLDER_IDS_BY_PLACE_STORAGE_KEY,
      JSON.stringify(folderIdsByPlace),
    );
  } catch {
    // Ignore storage failures and keep the in-memory folders usable.
  }
}
