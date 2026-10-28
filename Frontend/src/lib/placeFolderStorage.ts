import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  DEFAULT_PIN_COLOR,
  FOLDER_COLOR_CODES,
  FOLDER_COLOR_HEX,
} from '../entities/folder/color';

// 폴더 API가 준비되기 전까지 기기에 저장하는 임시 저장소입니다.
const PLACE_FOLDERS_STORAGE_KEY = '@yeogidam/place-folders';

// 폴더 색상은 지도 핀 색으로도 쓰입니다. 첫 번째 색이 기본값입니다.
export const FOLDER_COLORS = [
  DEFAULT_PIN_COLOR,
  ...FOLDER_COLOR_CODES.map(code => FOLDER_COLOR_HEX[code]),
];
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
  color: string;
  placeIds: string[];
  // 장소 id별로 이 폴더에 담은 시각입니다. 기록 도입 전에 담은 장소는 없을 수 있습니다.
  // TODO(폴더 API): 서버가 folderIds를 담은 순서로 내려 주면 지웁니다.
  placeAddedAt?: Record<string, string>;
  createdAt: string;
};

/**
 * 장소마다 담긴 폴더 id를 서버 `folderIds`와 같은 순서(담은 시각 오름차순, 최신이 마지막)로 모읍니다.
 * 담은 시각이 같으면(한 번에 여러 폴더에 담으면) 먼저 만든 폴더가 앞에 옵니다.
 * TODO(폴더 API): 서버 응답의 folderIds를 쓰게 되면 이 함수와 테스트를 지웁니다.
 */
export function getFolderIdsByPlaceId(
  folders: PlaceFolder[],
): Map<string, string[]> {
  const entries = new Map<string, { folderId: string; addedAt: string }[]>();
  for (const folder of folders) {
    for (const placeId of folder.placeIds) {
      const addedAt = folder.placeAddedAt?.[placeId] ?? folder.createdAt;
      const placeEntries = entries.get(placeId) ?? [];
      placeEntries.push({ folderId: folder.id, addedAt });
      entries.set(placeId, placeEntries);
    }
  }
  // 정렬은 안정적이므로 시각이 같으면 폴더 순서(만든 순서)가 유지됩니다.
  return new Map(
    [...entries].map(([placeId, placeEntries]) => [
      placeId,
      placeEntries
        .sort((a, b) =>
          a.addedAt < b.addedAt ? -1 : a.addedAt > b.addedAt ? 1 : 0,
        )
        .map(entry => entry.folderId),
    ]),
  );
}

function isPlaceFolder(value: unknown): value is PlaceFolder {
  if (!value || typeof value !== 'object') return false;

  const folder = value as Partial<PlaceFolder>;
  // 색상 도입 전에 저장된 폴더도 읽을 수 있도록 color는 선택으로 취급합니다.
  return (
    typeof folder.id === 'string' &&
    typeof folder.name === 'string' &&
    typeof folder.createdAt === 'string' &&
    Array.isArray(folder.placeIds) &&
    folder.placeIds.every(id => typeof id === 'string')
  );
}

export async function getPlaceFolders(): Promise<PlaceFolder[]> {
  try {
    const storedValue = await AsyncStorage.getItem(PLACE_FOLDERS_STORAGE_KEY);
    if (!storedValue) return [];

    const parsedValue = JSON.parse(storedValue);
    return Array.isArray(parsedValue)
      ? parsedValue
          .filter(isPlaceFolder)
          .map(folder => ({
            ...folder,
            color:
              typeof folder.color === 'string'
                ? folder.color
                : DEFAULT_FOLDER_COLOR,
          }))
      : [];
  } catch {
    return [];
  }
}

export async function setPlaceFolders(folders: PlaceFolder[]): Promise<void> {
  try {
    await AsyncStorage.setItem(
      PLACE_FOLDERS_STORAGE_KEY,
      JSON.stringify(folders),
    );
  } catch {
    // Ignore storage failures and keep the in-memory folders usable.
  }
}
