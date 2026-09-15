-- E2E 테스트 메서드 간 격리용. 트랜잭션 롤백으로 격리할 수 없는 테스트가 시작 전에 돌린다.
-- 시나리오 데이터(회원, 리프레시 세션)만 비운다. 정적 마스터 데이터는 아직 없다.
SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE refresh_sessions;
TRUNCATE TABLE members;
SET FOREIGN_KEY_CHECKS = 1;
