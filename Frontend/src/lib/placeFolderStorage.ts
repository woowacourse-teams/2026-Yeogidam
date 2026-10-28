import AsyncStorage from '@react-native-async-storage/async-storage';

// 폴더 API가 준비되기 전까지 기기에 저장하는 임시 저장소입니다.
const PLACE_FOLDERS_STORAGE_KEY = '@yeogidam/place-folders';

// 폴더 색상은 지도 핀 색으로도 쓰입니다. 첫 번째 색이 기본값입니다.
export const FOLDER_COLORS = [
  '#8FA2FF',
  '#FF8A80',
  '#FFB74D',
  '#F2C94C',
  '#81C784',
  '#4DB6AC',
  '#BA68C8',
  '#F06292',
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
  createdAt: string;
};

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
