-- 로컬 실행용 데이터. 기동마다 schema.sql이 테이블을 새로 만든 뒤 실행된다.
-- 회원 행은 여기 없다. 카카오 회원번호는 환경변수라 LocalMemberSeeder가 .env의 SEED_KAKAO_USER_ID_BEAN(회원 1 정콩), SEED_KAKAO_USER_ID_LUCKY(회원 2 러키)로 넣는다.
-- 이 파일이 먼저 실행되고 회원은 그 뒤에 들어가므로 FK 검사를 잠시 끄고 넣는다.

-- 시각 리터럴은 UTC 기준이다. 애플리케이션은 connectionTimeZone=UTC와 forceConnectionTimeZoneToSession=true로 연결된다.
-- 화면에 KST 기준 시각을 보여주려면, sql에 값 작성 시 KST 시간에서 9시간을 빼서 작성한다. (예: 12:00 KST -> 03:00 UTC)
-- CLI에서 직접 INSERT할 때도 먼저 SET SESSION time_zone = '+00:00'을 실행한다.

-- 시나리오
--   정콩(1): 릴스 5개를 6회 공유. 같은 릴스를 다시 공유한 이력과 추출 실패·진행 중 상태가 있다.
--   러키(2): 릴스 3개를 공유했고, 정콩과 같은 릴스(10)도 공유했다.
--   보관함: 정콩 카페 온월, 블루보틀 성수 카페 / 러키 카페 온월, 성수 베이커리, 망원한강공원
--   추출은 성공했는데 보관함에 없는 장소(정콩의 경복궁, 성수 베이커리, 을지로 노가리골목 / 러키의 블루보틀 성수 카페, 광장시장, 북촌 한옥마을)는 자동 저장 뒤 보관함에서 지운 것으로 본다.

SET FOREIGN_KEY_CHECKS = 0;

-- 장소 사전 (공용)
INSERT INTO places (id, kakao_place_id, name, category, land_lot_address, road_address, latitude, longitude,
                    kakao_place_url, telephone, thumbnail_key, thumbnail_source)
VALUES (1, '26338954', '카페 온월', '음식점 > 카페', '서울 성동구 성수동2가 289-10', '서울 성동구 성수이로 26 2층',
        37.5445000000, 127.0561000000, 'https://place.map.kakao.com/26338954', '02-1234-5678',
        'yeogidam/place-thumbnails/26338954.jpg', 'KAKAO'),
       (2, '1492599844', '블루보틀 성수 카페', '음식점 > 카페 > 커피전문점 > 블루보틀',
        '서울 성동구 성수동1가 656-302', '서울 성동구 아차산로 7', 37.5480882797, 127.0456428534,
        'http://place.map.kakao.com/1492599844', '1533-6906', NULL, NULL),
       (3, '8083047', '경복궁', '관광명소', '서울 종로구 세종로 1-1', '서울 종로구 사직로 161',
        37.5796000000, 126.9770000000, 'https://place.map.kakao.com/8083047', NULL,
        'yeogidam/place-thumbnails/8083047.jpg', 'KAKAO'),
       (4, '11394248', '성수 베이커리', '음식점 > 베이커리', '서울 성동구 성수동1가 685-142', '서울 성동구 연무장길 45',
        37.5426000000, 127.0538000000, 'https://place.map.kakao.com/11394248', '02-2222-3333',
        'yeogidam/place-thumbnails/11394248.jpg', 'KAKAO'),
       (5, '27503216', '을지로 노가리골목', '음식점 > 술집', '서울 중구 을지로3가 116', '서울 중구 을지로11길 20',
        37.5664000000, 126.9917000000, 'https://place.map.kakao.com/27503216', NULL,
        'yeogidam/place-thumbnails/27503216.jpg', 'KAKAO'),
       (6, '8005979', '망원한강공원', '여행 > 공원', '서울 마포구 망원동 205-4', '서울 마포구 마포나루길 467',
        37.5528000000, 126.8946000000, 'https://place.map.kakao.com/8005979', '02-3780-0601',
        'yeogidam/instagram-thumbnails/C5mangwon.jpg', 'INSTAGRAM'),
       (7, '17733271', '광장시장', '쇼핑 > 시장', '서울 종로구 예지동 6-1', '서울 종로구 창경궁로 88',
        37.5701000000, 126.9996000000, 'https://place.map.kakao.com/17733271', '02-2267-0291',
        NULL, NULL),
       (8, '1234567890', '북촌 한옥마을', '관광명소', '서울 종로구 계동 37', '서울 종로구 계동길 37',
        37.5826000000, 126.9831000000, 'https://place.map.kakao.com/1234567890', NULL,
        'yeogidam/instagram-thumbnails/C6bukchon.jpg', 'INSTAGRAM');

-- 게시물 (인스타 릴스 자체. 여러 회원이 공유해도 한 행)
INSERT INTO media (id, media_shortcode, caption, thumbnail_key, author, extraction_status,
                   failure_reason, extraction_version, created_at, source_type)
VALUES (10, 'C1seongsu', '성수 카페 투어 🧁 온월 → 블루보틀 성수 카페 → 베이커리 #성수카페 #성수데이트',
        'yeogidam/instagram-thumbnails/C1seongsu.jpg', '@seongsu_life', 'SUCCEEDED', NULL, 1,
        '2026-09-10 09:00:00', 'SEEDED'),
       (11, 'C2gyeongbok', '경복궁 야간개장 다녀왔어요 🌙 #경복궁 #서울야경',
        'yeogidam/instagram-thumbnails/C2gyeongbok.jpg', '@seoul_walk', 'SUCCEEDED', NULL, 1,
        '2026-09-11 09:00:00', 'SEEDED'),
       (12, 'C3euljiro', '을지로 노가리골목에서 시원하게 🍺 #을지로 #힙지로',
        'yeogidam/instagram-thumbnails/C3euljiro.jpg', '@night_seoul', 'SUCCEEDED', NULL, 1,
        '2026-09-12 09:00:00', 'SEEDED'),
       (13, 'C4private', NULL, NULL, NULL, 'FAILED', 'CONTENT_UNAVAILABLE', 1,
        '2026-09-13 09:00:00', 'EXTRACTED'),
       (14, 'C5mangwon', '망원한강공원 피크닉 🧺 광장시장 들렀다가 #망원 #한강',
        'yeogidam/instagram-thumbnails/C5mangwon.jpg', '@picnic_daily', 'SUCCEEDED', NULL, 1,
        '2026-09-14 09:00:00', 'SEEDED'),
       (15, 'C6bukchon', '북촌 한옥마을 골목 산책 🏘️ #북촌 #한옥',
        'yeogidam/instagram-thumbnails/C6bukchon.jpg', '@hanok_lover', 'SUCCEEDED', NULL, 1,
        '2026-09-15 09:00:00', 'SEEDED'),
       (16, 'C7extracting', NULL, NULL, NULL, 'EXTRACTING', NULL, 1,
        '2026-09-16 09:00:00', 'EXTRACTED');

-- 추출 사실 (게시물 → 장소)
INSERT INTO media_places (id, media_id, place_id)
VALUES (1, 10, 1), (2, 10, 2), (3, 10, 4),
       (4, 11, 3),
       (5, 12, 5),
       (6, 14, 6), (7, 14, 7),
       (8, 15, 8);

-- 공유 사건 (누가 언제 어느 릴스를)
INSERT INTO shared_media (
    id, member_id, media_id, shared_url, created_at, extraction_status, failure_reason, extraction_version
)
VALUES (100, 1, 10, 'https://www.instagram.com/reel/C1seongsu/', '2026-09-10 10:00:00', 'SUCCEEDED', NULL, 1),
       (101, 1, 11, 'https://www.instagram.com/reel/C2gyeongbok/', '2026-09-11 10:00:00', 'SUCCEEDED', NULL, 1),
       (102, 1, 10, 'https://www.instagram.com/reel/C1seongsu/', '2026-09-12 10:00:00', 'SUCCEEDED', NULL, 1),
       (103, 1, 12, 'https://www.instagram.com/reel/C3euljiro/', '2026-09-13 10:00:00', 'SUCCEEDED', NULL, 1),
       (104, 1, 13, 'https://www.instagram.com/reel/C4private/', '2026-09-14 10:00:00', 'FAILED', 'CONTENT_UNAVAILABLE', 1),
       (105, 1, 16, 'https://www.instagram.com/reel/C7extracting/', '2026-09-16 10:00:00', 'EXTRACTING', NULL, 1),
       (200, 2, 10, 'https://www.instagram.com/reel/C1seongsu/', '2026-09-11 11:00:00', 'SUCCEEDED', NULL, 1),
       (201, 2, 14, 'https://www.instagram.com/reel/C5mangwon/', '2026-09-14 11:00:00', 'SUCCEEDED', NULL, 1),
       (202, 2, 15, 'https://www.instagram.com/reel/C6bukchon/', '2026-09-15 11:00:00', 'SUCCEEDED', NULL, 1);

-- 회원별 보관함
INSERT INTO saved_places (id, member_id, place_id, last_saved_at)
VALUES (1, 1, 1, '2026-09-12 12:00:00'),
       (2, 1, 2, '2026-09-12 12:00:05'),
       (3, 2, 1, '2026-09-11 13:00:00'),
       (4, 2, 4, '2026-09-11 13:00:05'),
       (5, 2, 6, '2026-09-14 13:00:00');

-- 어느 공유에서 저장했나 (관련 릴스 조회의 근거)
INSERT INTO shared_media_saved_places (id, saved_place_id, shared_media_id, created_at)
VALUES (1, 1, 102, '2026-09-12 12:00:00'),
       (2, 2, 102, '2026-09-12 12:00:05'),
       (3, 3, 200, '2026-09-11 13:00:00'),
       (4, 4, 200, '2026-09-11 13:00:05'),
       (5, 5, 201, '2026-09-14 13:00:00');

-- 제보 (정콩이 실패한 공유를 제보)
INSERT INTO shared_media_reports (id, shared_media_id, created_at)
VALUES (1, 104, '2026-09-14 10:05:00');

SET FOREIGN_KEY_CHECKS = 1;
