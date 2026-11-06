/** 보관함 화면 좌우 여백(Figma 기준 20). */
export const LIBRARY_GUTTER = 20;
export const LIBRARY_GRID_GAP = 16;

export const LIBRARY_COLORS = {
  ink: '#1a1a2e',
  muted: '#8e8e93',
  segmentTrack: '#eef0fb',
  cardShadow: 'rgba(26, 26, 77, 0.08)',
} as const;

/** 썸네일이 없는 카드에 돌아가며 쓰는 파스텔 그라디언트(시안의 placeholder 색). */
export const PLACEHOLDER_GRADIENTS: readonly [string, string][] = [
  ['#b9c2ff', '#e6e9ff'],
  ['#efc9b4', '#faeee4'],
  ['#bddab8', '#ecf5ea'],
  ['#d6c4e4', '#f2ebf7'],
  ['#b8d8e4', '#e8f3f7'],
  ['#e9d9a8', '#f7f1dc'],
];

export function getPlaceholderGradient(index: number): [string, string] {
  return PLACEHOLDER_GRADIENTS[index % PLACEHOLDER_GRADIENTS.length];
}
