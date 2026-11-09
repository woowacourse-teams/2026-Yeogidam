// TODO(API 연동): Place/PlaceReel 타입에 없는 필드를 Figma 시안 값으로 채운 임시 목데이터입니다.
// 어떤 장소를 열어도 같은 값이 보이므로, API가 생기면 이 파일을 지우고 실제 값으로 바꿉니다.

export const MOCK_WEEKLY_HOURS: {
  day: string;
  hours: string;
  isToday?: boolean;
  isClosed?: boolean;
}[] = [
  { day: '월', hours: '10:00 – 22:00' },
  { day: '화', hours: '10:00 – 22:00' },
  { day: '수', hours: '10:00 – 22:00' },
  { day: '목', hours: '10:00 – 22:00', isToday: true },
  { day: '금', hours: '10:00 – 23:00' },
  { day: '토', hours: '10:00 – 23:00' },
  { day: '일', hours: '휴무', isClosed: true },
];

export const MOCK_MENU_PRICE_RANGE = '4,500원 ~ 9,500원';

export const MOCK_MENU_ITEMS = [
  { name: '시그니처 온도 라떼', price: '6,500원' },
  { name: '아메리카노', price: '4,500원' },
  { name: '크림 브륄레 케이크', price: '9,500원' },
  // 아래 항목은 시안에 없고, 메뉴 펼침을 확인하려고 추가한 값입니다.
  { name: '카페 라떼', price: '5,000원' },
  { name: '바닐라 라떼', price: '5,500원' },
  { name: '바스크 치즈 케이크', price: '7,500원' },
];

export const MOCK_BLOG_POSTS = [
  {
    id: 'mock-blog-1',
    title: '연남동 감성 카페 온도, 라떼가 진짜 맛있어요',
    meta: '네이버 · 하루의기록 · 3일 전',
  },
  {
    id: 'mock-blog-2',
    title: '연남동 데이트 코스 추천 (카페 온도 + 맛집)',
    meta: '티스토리 · 소소한일상 · 2주 전',
  },
  {
    id: 'mock-blog-3',
    title: '[연남동] 조용히 작업하기 좋은 카페 온도',
    meta: '네이버 · 카공러 · 1개월 전',
  },
  {
    id: 'mock-blog-4',
    title: '카페 온도 방문 후기 & 메뉴 가격 정리',
    meta: '네이버 · 맛집탐방 · 1개월 전',
  },
  {
    id: 'mock-blog-5',
    title: '연남동 신상 카페 투어, 온도 솔직 후기',
    meta: '브런치 · 여행자 · 2개월 전',
  },
];
