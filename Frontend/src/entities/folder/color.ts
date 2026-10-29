// 서버가 폴더 색으로 주고받는 코드입니다. 앱은 코드마다 정한 색으로 그립니다.
export const FOLDER_COLOR_CODES = [
  'RED',
  'ORANGE',
  'YELLOW',
  'GREEN',
  'TEAL',
  'PURPLE',
  'PINK',
] as const;

export type FolderColorCode = (typeof FOLDER_COLOR_CODES)[number];

export const FOLDER_COLOR_HEX: Record<FolderColorCode, string> = {
  RED: '#FF8A80',
  ORANGE: '#FFB74D',
  YELLOW: '#F2C94C',
  GREEN: '#81C784',
  TEAL: '#4DB6AC',
  PURPLE: '#BA68C8',
  PINK: '#F06292',
};

// 폴더 색 선택지입니다. 지도 핀 색으로도 쓰이고, 첫 번째 색이 기본값입니다.
// 지도 기본 핀 색(DEFAULT_PIN_COLOR)은 폴더 색으로 고를 수 없습니다.
export const FOLDER_COLORS = FOLDER_COLOR_CODES.map(code => FOLDER_COLOR_HEX[code]);

// 새 폴더가 기존 폴더와 다른 색으로 시작하도록, 아직 쓰지 않은 색을 먼저 고릅니다.
export function getNextFolderColor(folders: {color: string}[]) {
  const usedColors = new Set(folders.map(folder => folder.color));
  return (
    FOLDER_COLORS.find(color => !usedColors.has(color)) ??
    FOLDER_COLORS[folders.length % FOLDER_COLORS.length]
  );
}

// 폴더를 열지 않았을 때의 핀 색이자, 모르는 색 코드를 받았을 때 쓰는 색입니다.
export const DEFAULT_PIN_COLOR = '#8FA2FF';

function isFolderColorCode(value: unknown): value is FolderColorCode {
  return FOLDER_COLOR_CODES.includes(value as FolderColorCode);
}

/** 서버의 폴더 색 코드를 핀과 폴더 썸네일에 쓸 hex로 바꿉니다. */
export function toFolderColorHex(color?: string | null): string {
  return isFolderColorCode(color) ? FOLDER_COLOR_HEX[color] : DEFAULT_PIN_COLOR;
}

/** 화면에서 고른 hex를 서버로 보낼 색 코드로 바꿉니다. 목록에 없는 색은 첫 번째 코드로 보냅니다. */
export function toFolderColorCode(hex?: string | null): FolderColorCode {
  return (
    FOLDER_COLOR_CODES.find(code => FOLDER_COLOR_HEX[code] === hex) ??
    FOLDER_COLOR_CODES[0]
  );
}
