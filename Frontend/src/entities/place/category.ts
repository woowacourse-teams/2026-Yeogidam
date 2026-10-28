// 서버의 장소 범주(칩) 코드입니다. 순서가 곧 칩 순서이고 기타는 맨 끝에 둡니다.
export const PLACE_CATEGORY_CODES = [
  'CAFE',
  'DESSERT',
  'KOREAN',
  'WESTERN',
  'JAPANESE',
  'CHINESE',
  'BUNSIK',
  'BAR',
  'SPECIALTY',
  'CULTURE_LEISURE',
  'ETC',
] as const;

export type PlaceCategoryCode = (typeof PLACE_CATEGORY_CODES)[number];

export const PLACE_CATEGORY_NAMES: Record<PlaceCategoryCode, string> = {
  CAFE: '카페',
  DESSERT: '디저트',
  KOREAN: '한식',
  WESTERN: '양식',
  JAPANESE: '일식',
  CHINESE: '중식',
  BUNSIK: '분식',
  BAR: '술집',
  SPECIALTY: '별미',
  CULTURE_LEISURE: '문화/여가',
  ETC: '기타',
};

// 카카오 원문의 `음식점 >` 다음 마디별 칩입니다.
const FOOD_CATEGORY_CODES: Record<string, PlaceCategoryCode> = {
  카페: 'CAFE',
  간식: 'DESSERT',
  한식: 'KOREAN',
  양식: 'WESTERN',
  일식: 'JAPANESE',
  중식: 'CHINESE',
  분식: 'BUNSIK',
  술집: 'BAR',
};

const CULTURE_LEISURE_PREFIXES = [
  ['문화,예술'],
  ['여행'],
  ['스포츠,레저'],
  ['가정,생활', '여가시설'],
  ['가정,생활', '목욕탕,사우나'],
  ['가정,생활', '복합쇼핑몰'],
  ['가정,생활', '백화점'],
  ['가정,생활', '생활용품점'],
  ['가정,생활', '문구,사무용품'],
  ['이슈', '이벤트'],
  ['교육,학문', '학습시설', '도서관'],
];

function isPlaceCategoryCode(value: unknown): value is PlaceCategoryCode {
  return PLACE_CATEGORY_CODES.includes(value as PlaceCategoryCode);
}

/**
 * 카카오 원문 카테고리를 서버 대응표와 같은 규칙으로 칩 코드로 바꿉니다.
 * 부분 문자열이 아니라 마디를 통째로 비교합니다(`바나프레소`가 술집이 되지 않도록).
 * 서버가 `categoryCode`를 내려 주기 전까지 쓰는 임시 계산입니다.
 */
export function toPlaceCategoryCode(category?: string | null): PlaceCategoryCode {
  const segments = (category ?? '')
    .split('>')
    .map(segment => segment.trim())
    .filter(Boolean);
  const [first, second] = segments;

  if (first === '음식점') {
    if (!second) return 'ETC';
    return FOOD_CATEGORY_CODES[second] ?? 'SPECIALTY';
  }
  // 원문이 `한식`, `간식`처럼 한 마디로 오면 같은 이름의 칩으로 보냅니다.
  if (segments.length === 1 && FOOD_CATEGORY_CODES[first]) {
    return FOOD_CATEGORY_CODES[first];
  }
  const isCultureLeisure = CULTURE_LEISURE_PREFIXES.some(prefix =>
    prefix.every((segment, index) => segments[index] === segment),
  );
  return isCultureLeisure ? 'CULTURE_LEISURE' : 'ETC';
}

/** 서버가 준 칩 코드를 우선 쓰고, 없거나 모르는 값이면 원문으로 계산합니다. */
export function resolvePlaceCategoryCode(place: {
  category?: string | null;
  categoryCode?: string | null;
}): PlaceCategoryCode {
  return isPlaceCategoryCode(place.categoryCode)
    ? place.categoryCode
    : toPlaceCategoryCode(place.category);
}
