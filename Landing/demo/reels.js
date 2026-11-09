// 데모에 쓰는 릴스 두 개와 찾은 장소. 릴스는 여기담 계정의 실제 게시물이고, 장소 정보와 사진은 카카오 지도의 실제 값이다
// code는 앱의 장소 범주(categories.js)이고, x와 y는 지도 그림 위 핀 자리(%)다. y는 위쪽 검색창과 칩 줄, 아래 시트에 가리지 않게 24에서 43 사이에 둔다
export const REELS = [
  {
    id:'gunja', chip:'군자역 디저트 5곳', author:'@yeogidamm', av:'담', likes:'1.2만', comments:'36',
    title:'군자역 디저트 저장각 🍰',
    caption:'군자역 디저트 저장각 🍰 📍오픈 한 달 만에 방문자리뷰 500개 넘긴 후르츠산도 맛집, 윤숲 📍다이닝코드 맛 평가 4.6, 과일 크레이프가 유명한, FCC 📍군자역 도보 3분, 책 읽기 좋은 북카페, 책방 고즈넉 📍에그타르트로 후기 많은 골목 디저트 카페, 윤키 📍필터커피 후기가 좋은 카페, 연필',
    post:'https://www.instagram.com/p/Db4gRWqkuUg/', thumb:'assets/reel-gunja.jpg',
    mapLabel:'군자역', map:'gunja',
    places:[
      {name:'윤숲 후르츠산도점', code:'CAFE', cat:'음식점 > 카페', road:'서울 광진구 면목로7길 8', lot:'서울 광진구 중곡동 628-7', url:'https://place.map.kakao.com/1775568752', img:'assets/place-1775568752.jpg', x:33, y:24},
      {name:'에프씨씨', code:'CAFE', cat:'음식점 > 카페', road:'서울 광진구 용마산로3길 88', lot:'서울 광진구 중곡동 134-1', url:'https://place.map.kakao.com/137070444', img:'assets/place-137070444.jpg', x:80, y:31},
      {name:'책방고즈넉', code:'CAFE', cat:'음식점 > 카페', road:'서울 광진구 동일로60길 41-13', lot:'서울 광진구 군자동 467-15', url:'https://place.map.kakao.com/337953507', img:'assets/place-337953507.jpg', x:25, y:30},
      {name:'윤키', code:'CAFE', cat:'음식점 > 카페 > 테마카페 > 디저트카페', road:'서울 광진구 능동로38길 27', lot:'서울 광진구 중곡동 142-21', url:'https://place.map.kakao.com/98016856', img:'assets/place-98016856.jpg', x:65, y:34},
      {name:'연필', code:'CAFE', cat:'음식점 > 카페 > 커피전문점', road:'서울 광진구 면목로 12', lot:'서울 광진구 군자동 49-17', url:'https://place.map.kakao.com/1107844606', img:'assets/place-1107844606.jpg', x:20, y:42}
    ]
  },
  {
    id:'chabap', chip:'강민경 차밥열끼 8곳', author:'@yeogidamm', av:'담', likes:'2,048', comments:'31',
    title:'먹잘알 강민경의 차밥열끼 시즌8 🚗💨',
    caption:'먹잘알 강민경의 차밥열끼 시즌8 🚗💨 영상 보면서 여긴 꼭 가야겠다 싶었던 맛집 8곳을 싹 정리해왔어요! 🍽️ 📍 키노이에 파티 📍 홍춘 📍 화덕돌곱창 📍 꽃돌이네 📍 수족관 📍 쿠노카츠 강남본점 📍 보영만두 📍 김빠',
    post:'https://www.instagram.com/p/DebnmRckoy1/', thumb:'assets/reel-chabap.jpg',
    mapLabel:'강남구', map:'metro',
    places:[
      {name:'키노이에파티', code:'JAPANESE', cat:'음식점 > 일식', road:'서울 강남구 도산대로72길 8', lot:'서울 강남구 청담동 5-7', url:'https://place.map.kakao.com/527159312', img:'assets/place-527159312.jpg', x:60, y:25},
      {name:'홍춘', code:'CHINESE', cat:'음식점 > 중식', road:'경기 용인시 수지구 죽전로168번길 29', lot:'경기 용인시 수지구 죽전동 1336-6', url:'https://place.map.kakao.com/18042790', img:'assets/place-18042790.jpg', x:70, y:40},
      {name:'화덕돌곱창', code:'KOREAN', cat:'음식점 > 한식 > 육류,고기 > 곱창,막창', road:'충북 청주시 서원구 안뜸로 60', lot:'충북 청주시 서원구 분평동 249-6', url:'https://place.map.kakao.com/2014608758', img:'assets/place-2014608758.jpg', x:84, y:35},
      {name:'꽃돌이네', code:'KOREAN', cat:'음식점 > 한식 > 육류,고기', road:'서울 강남구 언주로174길 29', lot:'서울 강남구 신사동 639-7', url:'https://place.map.kakao.com/2033985372', img:'assets/place-2033985372.jpg', x:40, y:28},
      {name:'수족관', code:'KOREAN', cat:'음식점 > 한식 > 해물,생선', road:'서울 강남구 도산대로37길 30', lot:'서울 강남구 신사동', url:'https://place.map.kakao.com/969282150', img:'assets/place-969282150.jpg', x:52, y:33},
      {name:'쿠노카츠', code:'JAPANESE', cat:'음식점 > 일식 > 돈까스,우동', road:'서울 서초구 서운로 226', lot:'서울 서초구 서초동', url:'https://place.map.kakao.com/1513233857', img:'assets/place-1513233857.jpg', x:30, y:37},
      {name:'보영만두 북문본점', code:'BUNSIK', cat:'음식점 > 분식', road:'경기 수원시 장안구 팔달로 271', lot:'경기 수원시 장안구 영화동 282-3', url:'https://place.map.kakao.com/27135707', img:'assets/place-27135707.jpg', x:18, y:43},
      {name:'태양옥김빠', code:'BUNSIK', cat:'음식점 > 분식', road:'서울 강동구 성내로 42', lot:'서울 강동구 성내동 550-5', url:'https://place.map.kakao.com/1583503104', img:'assets/place-1583503104.jpg', x:86, y:27}
    ]
  }
];
