-- 로컬 앱 시작과 각 DB 테스트 전에 함께 사용하는 데이터 정리 SQL이다.
-- 업무 데이터와 자동 증가 ID만 초기화한다. 테이블 구조와 flyway_schema_history는 유지한다.
SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE folder_saved_places;
TRUNCATE TABLE folders;
TRUNCATE TABLE shared_media_reports;
TRUNCATE TABLE shared_media_saved_places;
TRUNCATE TABLE saved_places;
TRUNCATE TABLE media_places;
TRUNCATE TABLE shared_media;
TRUNCATE TABLE media;
TRUNCATE TABLE places;
TRUNCATE TABLE refresh_sessions;
TRUNCATE TABLE members;
SET FOREIGN_KEY_CHECKS = 1;
