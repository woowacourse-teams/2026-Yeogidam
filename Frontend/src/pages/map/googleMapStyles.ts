/**
 * 색은 네이버 지도 스크린샷에서 많이 쓰인 색을 뽑아 맞췄습니다(회색 바탕, 베이지 시가지,
 * 흰 골목길, 연노랑 큰길, 주황 고속도로).
 */
const MAP_STYLE = [
  // 모든 요소에 바탕색을 칠하면 지하철 노선 같은 선도 바탕색에 묻히므로 땅에만 칠합니다.
  {
    featureType: 'landscape',
    elementType: 'geometry',
    stylers: [{ color: '#f4f4f4' }],
  },
  { elementType: 'labels.text.fill', stylers: [{ color: '#4a4a4a' }] },
  {
    elementType: 'labels.text.stroke',
    stylers: [{ color: '#ffffff' }, { weight: 3 }],
  },
  {
    featureType: 'administrative.country',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#7a7a7a' }, { weight: 1 }],
  },
  {
    featureType: 'administrative.country',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#3d5f9e' }],
  },
  {
    featureType: 'administrative.province',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#c9c9c9' }],
  },
  // 국내 동 이름은 neighborhood가 아니라 locality로 분류되어 있어서, 동만 따로 숨길 수 없어
  // 시·구 이름과 함께 흰 테두리 없는 회색 글씨로 둡니다.
  {
    featureType: 'administrative.locality',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#8a8a8a' }],
  },
  {
    featureType: 'administrative.locality',
    elementType: 'labels.text.stroke',
    stylers: [{ visibility: 'off' }],
  },
  // Google 국내 데이터는 시가지 영역을 산까지 넓게 잡아서, 네이버의 블록 색(#f4e8dc)을
  // 그대로 쓰면 지도 전체가 베이지가 됩니다. 바탕에 가까운 연한 베이지로 낮춥니다.
  {
    featureType: 'landscape.man_made',
    elementType: 'geometry.fill',
    stylers: [{ color: '#f6f1eb' }],
  },
  {
    featureType: 'landscape.man_made',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#ede6dd' }],
  },
  // 공원·산 같은 녹지는 네이버 지도의 연한 초록(경복궁, 남산 등)에 맞춥니다.
  {
    featureType: 'landscape.natural',
    elementType: 'geometry',
    stylers: [{ color: '#dfedd0' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: '#dfedd0' }],
  },
  {
    featureType: 'poi.sports_complex',
    elementType: 'geometry',
    stylers: [{ color: '#dfedd0' }],
  },
  // 저장 장소 마커와 헷갈리지 않도록 가게는 숨기고, 명소·공원·관공서·학교·병원 같은
  // 랜드마크는 위치를 가늠할 수 있게 아이콘과 이름을 남깁니다.
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  // 랜드마크 아이콘과 이름은 네이버 지도 스크린샷에서 종류별로 뽑은 차분한 색에 맞춥니다.
  {
    featureType: 'poi.government',
    elementType: 'labels.icon',
    stylers: [{ color: '#9ca8c6' }],
  },
  {
    featureType: 'poi.attraction',
    elementType: 'labels.icon',
    stylers: [{ color: '#a2968a' }],
  },
  {
    featureType: 'poi.place_of_worship',
    elementType: 'labels.icon',
    stylers: [{ color: '#a2968a' }],
  },
  {
    featureType: 'poi.sports_complex',
    elementType: 'labels.icon',
    stylers: [{ color: '#9ca8c6' }],
  },
  {
    featureType: 'poi.school',
    elementType: 'labels.icon',
    stylers: [{ color: '#90aef0' }],
  },
  {
    featureType: 'poi.medical',
    elementType: 'labels.icon',
    stylers: [{ color: '#de8484' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'labels.icon',
    stylers: [{ color: '#78b460' }],
  },
  // 남산 같은 산 아이콘은 poi가 아니라 자연 지형으로 분류되어 따로 맞춥니다.
  {
    featureType: 'landscape.natural',
    elementType: 'labels.icon',
    stylers: [{ color: '#78b460' }],
  },
  {
    featureType: 'poi.school',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#5b8bd6' }],
  },
  {
    featureType: 'poi.medical',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#d0646c' }],
  },
  // 출구 번호·버스 정류장까지 Google 역 표시를 모두 숨기고, 역 건물 이름이 직접 그린
  // 역 마커와 겹치지 않도록 건물 이름도 숨깁니다(아파트·빌딩 이름도 함께 사라집니다).
  {
    featureType: 'transit.station',
    elementType: 'labels',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'landscape.man_made',
    elementType: 'labels',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#3f8a3a' }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#a4d0f0' }],
  },
  {
    featureType: 'water',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#4a6fa5' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry.fill',
    stylers: [{ color: '#f8d098' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#e4a870' }],
  },
  {
    featureType: 'road.arterial',
    elementType: 'geometry.fill',
    stylers: [{ color: '#fcf0b4' }],
  },
  {
    featureType: 'road.arterial',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#e2cd84' }],
  },
  {
    featureType: 'road.local',
    elementType: 'geometry.fill',
    stylers: [{ color: '#ffffff' }],
  },
  {
    featureType: 'road.local',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#d4d4d4' }],
  },
  // 도로 번호 아이콘과 도로명은 모두 숨깁니다.
  {
    featureType: 'road',
    elementType: 'labels',
    stylers: [{ visibility: 'off' }],
  },
];

/**
 * 네이티브는 줌 단계별 스타일 목록을 받지만, 스타일을 바꿔 끼울 때마다 Google이 지도 타일을
 * 다시 그려 깜빡이므로 단계를 하나만 둡니다.
 */
export const GOOGLE_MAP_ZOOM_STYLES_JSON = JSON.stringify([
  { minZoom: 0, styleJson: JSON.stringify(MAP_STYLE) },
]);
