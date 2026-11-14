// 앱의 장소 범주 11개. 칩 순서와 이름, 지도 핀 안에 넣는 흰색 아이콘은 앱 2.3.0(src/entities/place/category.ts)을 따른다
export const CATEGORIES = [
  { code: 'CAFE', name: '카페', icon: 'assets/category-cafe.svg' },
  { code: 'DESSERT', name: '디저트', icon: 'assets/category-dessert.svg' },
  { code: 'KOREAN', name: '한식', icon: 'assets/category-korean.svg' },
  { code: 'WESTERN', name: '양식', icon: 'assets/category-western.svg' },
  { code: 'JAPANESE', name: '일식', icon: 'assets/category-japanese.svg' },
  { code: 'CHINESE', name: '중식', icon: 'assets/category-chinese.svg' },
  { code: 'BUNSIK', name: '분식', icon: 'assets/category-bunsik.svg' },
  { code: 'BAR', name: '술집', icon: 'assets/category-bar.svg' },
  { code: 'SPECIALTY', name: '별미', icon: 'assets/category-specialty.svg' },
  { code: 'CULTURE_LEISURE', name: '문화/여가', icon: 'assets/category-culture-leisure.svg' },
  { code: 'ETC', name: '기타', icon: 'assets/category-etc.svg' },
];

// 칩 줄 맨 앞의 「전체」
export const ALL = 'ALL';

export function categoryOf(code) {
  return CATEGORIES.find((category) => category.code === code);
}

// 카카오 카테고리 「음식점 > 카페 > 커피전문점」에서 둘째 마디(카페)를 장소 이름 옆 알약에 쓴다
export function middleCategory(kakaoCategory) {
  const parts = kakaoCategory.split('>').map((part) => part.trim()).filter(Boolean);
  return parts[1] || parts[0] || '';
}

export function placesIn(places, code) {
  return code === ALL ? places : places.filter((place) => place.code === code);
}
