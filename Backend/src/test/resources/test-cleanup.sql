-- 각 DB 테스트 전에 업무 데이터와 자동 증가 ID를 초기화하는 테스트 전용 정리 SQL이다.
-- 대상 테이블은 로컬 초기화용 cleanup.sql과 같고, TestCleanupSqlTest가 두 목록이 같은지 확인한다.
-- MySQL의 TRUNCATE는 테이블마다 다시 만드는 비용이 커서, 데이터가 적은 테스트에서는 DELETE가 빠르다.
-- DELETE는 자동 증가 값을 되돌리지 않으므로 빈 테이블에 AUTO_INCREMENT = 1을 지정해 ID를 1부터 다시 쓴다.
-- 테이블에 행이 남아 있으면 MySQL은 AUTO_INCREMENT를 최댓값 + 1로 맞추므로, 정리와 동시에 들어온 쓰기가 있으면 ID가 밀린다.
SET FOREIGN_KEY_CHECKS = 0;
DELETE FROM folder_saved_places;
ALTER TABLE folder_saved_places AUTO_INCREMENT = 1;
DELETE FROM folders;
ALTER TABLE folders AUTO_INCREMENT = 1;
DELETE FROM shared_media_reports;
ALTER TABLE shared_media_reports AUTO_INCREMENT = 1;
DELETE FROM shared_media_saved_places;
ALTER TABLE shared_media_saved_places AUTO_INCREMENT = 1;
DELETE FROM saved_places;
ALTER TABLE saved_places AUTO_INCREMENT = 1;
DELETE FROM media_places;
ALTER TABLE media_places AUTO_INCREMENT = 1;
DELETE FROM shared_media;
ALTER TABLE shared_media AUTO_INCREMENT = 1;
DELETE FROM media;
ALTER TABLE media AUTO_INCREMENT = 1;
DELETE FROM places;
ALTER TABLE places AUTO_INCREMENT = 1;
DELETE FROM refresh_sessions;
ALTER TABLE refresh_sessions AUTO_INCREMENT = 1;
DELETE FROM members;
ALTER TABLE members AUTO_INCREMENT = 1;
SET FOREIGN_KEY_CHECKS = 1;
