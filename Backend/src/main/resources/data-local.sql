-- 로컬 실행용 데이터. 기동마다 schema.sql이 테이블을 새로 만든 뒤 실행된다.
-- 회원 행은 여기 없다. 카카오 회원번호는 환경변수라 LocalMemberSeeder가 .env의
-- SEED_KAKAO_USER_ID_BEAN(회원 1 정콩), SEED_KAKAO_USER_ID_LUCKY(회원 2 러키)로 넣는다.
-- 이 파일이 먼저 실행되고 회원은 그 뒤에 들어가므로 FK 검사를 잠시 끄고 넣는다.
--
-- 시나리오
--   정콩(1): 릴스 5개 공유(공유 6건). 성수 카페 릴스(10)는 두 번 공유해 첫 공유(100)의 후보가 SUPERSEDED.
--            경복궁은 버렸고, 추출 실패 릴스(13)와 추출 중 릴스(16)도 있다.
--   러키(2): 릴스 3개 공유. 하나는 정콩과 같은 릴스(10). 대기함에 미결정 후보가 남아 있는 공유(202)가 있다.
--   대기함(UNDECIDED가 남은 공유): 정콩 102, 103 / 러키 202
--   보관함: 정콩 카페 온월, 윤숲 후르츠산도 / 러키 카페 온월, 성수 베이커리, 망원한강공원

SET FOREIGN_KEY_CHECKS = 0;

-- 장소 사전 (공용)
INSERT INTO places (id, kakao_place_id, name, category, land_lot_address, road_address, latitude, longitude,
                    kakao_place_url, telephone, thumbnail_url, thumbnail_source, thumbnail_attribution)
VALUES (1, '26338954', '카페 온월', '음식점 > 카페', '서울 성동구 성수동2가 289-10', '서울 성동구 성수이로 26 2층',
        37.5445000000, 127.0561000000, 'https://place.map.kakao.com/26338954', '02-1234-5678',
        'https://picsum.photos/seed/onwol/400/400', 'GOOGLE',
        '<a href="https://maps.google.com/maps/contrib/1">작성자</a>'),
       (2, '1775568752', '윤숲 후르츠산도', '음식점 > 디저트', '서울 광진구 화양동 1-1', NULL,
        37.5400000000, 127.0700000000, 'https://place.map.kakao.com/1775568752', NULL, NULL, NULL, NULL),
       (3, '8083047', '경복궁', '관광명소', '서울 종로구 세종로 1-1', '서울 종로구 사직로 161',
        37.5796000000, 126.9770000000, 'https://place.map.kakao.com/8083047', NULL,
        'https://picsum.photos/seed/gyeongbok/400/400', 'KAKAO', NULL),
       (4, '11394248', '성수 베이커리', '음식점 > 베이커리', '서울 성동구 성수동1가 685-142', '서울 성동구 연무장길 45',
        37.5426000000, 127.0538000000, 'https://place.map.kakao.com/11394248', '02-2222-3333',
        'https://picsum.photos/seed/bakery/400/400', 'KAKAO', NULL),
       (5, '27503216', '을지로 노가리골목', '음식점 > 술집', '서울 중구 을지로3가 116', '서울 중구 을지로11길 20',
        37.5664000000, 126.9917000000, 'https://place.map.kakao.com/27503216', NULL,
        'https://picsum.photos/seed/euljiro/400/400', 'GOOGLE',
        '<a href="https://maps.google.com/maps/contrib/5">사진작가</a>'),
       (6, '8005979', '망원한강공원', '여행 > 공원', '서울 마포구 망원동 205-4', '서울 마포구 마포나루길 467',
        37.5528000000, 126.8946000000, 'https://place.map.kakao.com/8005979', '02-3780-0601',
        'https://picsum.photos/seed/mangwon/400/400', 'KAKAO', NULL),
       (7, '17733271', '광장시장', '쇼핑 > 시장', '서울 종로구 예지동 6-1', '서울 종로구 창경궁로 88',
        37.5701000000, 126.9996000000, 'https://place.map.kakao.com/17733271', '02-2267-0291',
        NULL, NULL, NULL),
       (8, '1234567890', '북촌 한옥마을', '관광명소', '서울 종로구 계동 37', '서울 종로구 계동길 37',
        37.5826000000, 126.9831000000, 'https://place.map.kakao.com/1234567890', NULL,
        'https://picsum.photos/seed/bukchon/400/400', 'INSTAGRAM', NULL);

-- 게시물 (인스타 릴스 자체. 여러 회원이 공유해도 한 행)
INSERT INTO media (id, media_shortcode, caption, thumbnail_url, author, extraction_status, failure_reason,
                   extraction_version, source_type, created_at)
VALUES (10, 'C1seongsu', '성수 카페 투어 🧁 온월 → 윤숲 → 베이커리 #성수카페 #성수데이트', 'https://picsum.photos/seed/reel10/300/400',
        '@seongsu_life', 'SUCCEEDED', NULL, 1, 'EXTRACTED', '2026-09-10 09:00:00'),
       (11, 'C2gyeongbok', '경복궁 야간개장 다녀왔어요 🌙 #경복궁 #서울야경', 'https://picsum.photos/seed/reel11/300/400',
        '@seoul_walk', 'SUCCEEDED', NULL, 1, 'EXTRACTED', '2026-09-11 09:00:00'),
       (12, 'C3euljiro', '을지로 노가리골목에서 시원하게 🍺 #을지로 #힙지로', 'https://picsum.photos/seed/reel12/300/400',
        '@night_seoul', 'SUCCEEDED', NULL, 1, 'EXTRACTED', '2026-09-12 09:00:00'),
       (13, 'C4private', NULL, NULL, NULL, 'FAILED', 'CONTENT_UNAVAILABLE', 1, 'EXTRACTED', '2026-09-13 09:00:00'),
       (14, 'C5mangwon', '망원한강공원 피크닉 🧺 광장시장 들렀다가 #망원 #한강', 'https://picsum.photos/seed/reel14/300/400',
        '@picnic_daily', 'SUCCEEDED', NULL, 1, 'EXTRACTED', '2026-09-14 09:00:00'),
       (15, 'C6bukchon', '북촌 한옥마을 골목 산책 🏘️ #북촌 #한옥', 'https://picsum.photos/seed/reel15/300/400',
        '@hanok_lover', 'SUCCEEDED', NULL, 1, 'EXTRACTED', '2026-09-15 09:00:00'),
       (16, 'C7extracting', NULL, NULL, NULL, 'EXTRACTING', NULL, 1, 'EXTRACTED', '2026-09-16 09:00:00');

-- 추출 사실 (게시물 → 장소)
INSERT INTO media_places (id, media_id, place_id)
VALUES (1, 10, 1), (2, 10, 2), (3, 10, 4),
       (4, 11, 3),
       (5, 12, 5),
       (6, 14, 6), (7, 14, 7),
       (8, 15, 8);

-- 공유 사건 (누가 언제 어느 릴스를)
INSERT INTO shared_media (id, member_id, media_id, shared_url, created_at)
VALUES (100, 1, 10, 'https://www.instagram.com/reel/C1seongsu/', '2026-09-10 10:00:00'),
       (101, 1, 11, 'https://www.instagram.com/reel/C2gyeongbok/', '2026-09-11 10:00:00'),
       (102, 1, 10, 'https://www.instagram.com/reel/C1seongsu/', '2026-09-12 10:00:00'),
       (103, 1, 12, 'https://www.instagram.com/reel/C3euljiro/', '2026-09-13 10:00:00'),
       (104, 1, 13, 'https://www.instagram.com/reel/C4private/', '2026-09-14 10:00:00'),
       (105, 1, 16, 'https://www.instagram.com/reel/C7extracting/', '2026-09-16 10:00:00'),
       (200, 2, 10, 'https://www.instagram.com/reel/C1seongsu/', '2026-09-11 11:00:00'),
       (201, 2, 14, 'https://www.instagram.com/reel/C5mangwon/', '2026-09-14 11:00:00'),
       (202, 2, 15, 'https://www.instagram.com/reel/C6bukchon/', '2026-09-15 11:00:00');

-- 공유 건마다 발급된 후보와 결정
INSERT INTO place_candidates (id, shared_media_id, place_id, decision_status, decided_at)
VALUES (1000, 100, 1, 'SUPERSEDED', NULL),
       (1001, 100, 2, 'SUPERSEDED', NULL),
       (1002, 100, 4, 'SUPERSEDED', NULL),
       (1003, 101, 3, 'DISCARDED', '2026-09-11 12:00:00'),
       (1004, 102, 1, 'SAVED', '2026-09-12 12:00:00'),
       (1005, 102, 2, 'SAVED', '2026-09-12 12:00:00'),
       (1006, 102, 4, 'UNDECIDED', NULL),
       (1007, 103, 5, 'UNDECIDED', NULL),
       (2000, 200, 1, 'SAVED', '2026-09-11 13:00:00'),
       (2001, 200, 2, 'DISCARDED', '2026-09-11 13:00:00'),
       (2002, 200, 4, 'SAVED', '2026-09-11 13:00:00'),
       (2003, 201, 6, 'SAVED', '2026-09-14 13:00:00'),
       (2004, 201, 7, 'DISCARDED', '2026-09-14 13:00:00'),
       (2005, 202, 8, 'UNDECIDED', NULL);

-- 보관함 (SAVED 결정의 결과)
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
