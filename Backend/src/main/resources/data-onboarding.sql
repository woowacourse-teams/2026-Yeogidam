-- 군자역 디저트 캐러셀의 사전 적재 데이터.
-- local은 data-local.sql 다음에 읽고, dev와 prod에는 이 파일을 데이터베이스에 직접 적용한다.
-- 자연키(media_shortcode, kakao_place_id) 기준 upsert라 여러 번 적용해도 중복되지 않는다.

INSERT INTO media (media_shortcode, caption, author, extraction_status, failure_reason, extraction_version, source_type)
VALUES ('Db4gRWqkuUg', '군자역 디저트 저장각 🍰

📍오픈 한 달 만에 방문자리뷰 500개 넘긴 후르츠산도 맛집, 윤숲

📍다이닝코드 맛 평가 4.6, 과일 크레이프가 유명한, FCC

📍군자역 도보 3분, 책 읽기 좋은 북카페, 책방 고즈넉

📍에그타르트로 후기 많은 골목 디저트 카페, 윤키

📍필터커피 후기가 좋은 카페, 연필

방문자 리뷰 · 평점 · 블로그 후기 기준으로 추린
군자역 디저트 맛집 5곳, 카드로 정리했어요.

지도엔 이거 말고도 군자역 디저트 맛집 더 있어요!!!
(사진 + 네이버 플레이스 바로가기까지)

💌 댓글에 “군자” 남기면 팔로우 여부 상관없이 지도 링크 DM으로 보내드려요!

#군자역카페 #윤숲 #군자역맛집 #광진구카페 #디저트맛집',
        '@yeogidamm', 'SUCCEEDED', NULL, 1, 'SEEDED') AS onboarding_media
ON DUPLICATE KEY UPDATE
    caption = onboarding_media.caption,
    author = onboarding_media.author,
    extraction_status = onboarding_media.extraction_status,
    failure_reason = onboarding_media.failure_reason,
    extraction_version = onboarding_media.extraction_version,
    source_type = onboarding_media.source_type;

INSERT INTO places (kakao_place_id, name, category, land_lot_address, road_address, latitude, longitude, kakao_place_url,
                    telephone)
VALUES ('1775568752', '윤숲 후르츠산도점', '음식점 > 카페', '서울 광진구 중곡동 628-7', '서울 광진구 면목로7길 8',
        37.5595478228, 127.0772756026, 'https://place.map.kakao.com/1775568752', '010-7901-7239'),
       ('137070444', '에프씨씨', '음식점 > 카페', '서울 광진구 중곡동 134-1', '서울 광진구 용마산로3길 88',
        37.5571767489, 127.0833823915, 'https://place.map.kakao.com/137070444', '0507-1363-2949'),
       ('337953507', '책방고즈넉', '음식점 > 카페', '서울 광진구 군자동 467-15', '서울 광진구 동일로60길 41-13',
        37.5578428719, 127.0762971247, 'https://place.map.kakao.com/337953507', '010-3524-2064'),
       ('98016856', '윤키', '음식점 > 카페 > 테마카페 > 디저트카페', '서울 광진구 중곡동 142-21',
        '서울 광진구 능동로38길 27', 37.5573429525, 127.0814902707,
        'https://place.map.kakao.com/98016856', '0502-5553-0774'),
       ('1107844606', '연필', '음식점 > 카페 > 커피전문점', '서울 광진구 군자동 49-17', '서울 광진구 면목로 12',
        37.5552241288, 127.0755882553, 'https://place.map.kakao.com/1107844606', '0502-5552-2000') AS onboarding_place
ON DUPLICATE KEY UPDATE
    name = onboarding_place.name,
    category = onboarding_place.category,
    land_lot_address = onboarding_place.land_lot_address,
    road_address = onboarding_place.road_address,
    latitude = onboarding_place.latitude,
    longitude = onboarding_place.longitude,
    kakao_place_url = onboarding_place.kakao_place_url,
    telephone = onboarding_place.telephone;

INSERT IGNORE INTO media_places (media_id, place_id)
SELECT media.id, places.id
FROM media
CROSS JOIN places
WHERE media.media_shortcode = 'Db4gRWqkuUg'
  AND places.kakao_place_id IN ('1775568752', '137070444', '337953507', '98016856', '1107844606');
