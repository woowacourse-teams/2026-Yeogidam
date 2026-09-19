-- 장소 3개. 장소 2는 비어 있을 수 있는 열이 전부 NULL이고, 장소 1은 구글 사진이라 출처 표기가 있다.
INSERT INTO places (id, kakao_place_id, name, category, land_lot_address, road_address, latitude, longitude,
                    kakao_place_url, telephone, thumbnail_url, thumbnail_source, thumbnail_attribution)
VALUES (1, 'kakao-1', '카페 온월', '음식점 > 카페', '서울 성동구 성수동2가 289-10', '서울 성동구 성수이로 26 2층',
        37.5445000000, 127.0561000000, 'https://place.map.kakao.com/1', '02-1234-5678',
        'https://img.example.com/1.jpg', 'GOOGLE', '<a href="https://maps.google.com/maps/contrib/1">작성자</a>'),
       (2, 'kakao-2', '윤숲 후르츠산도', NULL, '서울 광진구 화양동 1-1', NULL,
        37.5400000000, 127.0700000000, NULL, NULL, NULL, NULL, NULL),
       (3, 'kakao-3', '경복궁', '관광명소', '서울 종로구 세종로 1-1', '서울 종로구 사직로 161',
        37.5796000000, 126.9770000000, 'https://place.map.kakao.com/3', NULL,
        'https://img.example.com/3.jpg', 'KAKAO', NULL);
