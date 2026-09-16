-- E2E 테스트 메서드 간 격리용. 트랜잭션 롤백으로 격리할 수 없는 테스트가 시작 전에 돌린다.
-- 시나리오 데이터(회원, 세션, 게시물, 공유, 장소, 후보, 보관함, 제보)를 전부 비운다.
SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE shared_media_reports;
TRUNCATE TABLE shared_media_saved_places;
TRUNCATE TABLE saved_places;
TRUNCATE TABLE place_candidates;
TRUNCATE TABLE media_places;
TRUNCATE TABLE shared_media;
TRUNCATE TABLE media;
TRUNCATE TABLE places;
TRUNCATE TABLE refresh_sessions;
TRUNCATE TABLE members;
SET FOREIGN_KEY_CHECKS = 1;
