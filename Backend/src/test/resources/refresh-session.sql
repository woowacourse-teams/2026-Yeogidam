-- 회원 1의 리프레시 세션 한 건(session-1, 만료 2026-10-15). single-member.sql 뒤에 심는다.
INSERT INTO refresh_sessions (id, session_id, member_id, token_hash, expires_at, revoked)
VALUES (10, 'session-1', 1, 'hash-1', '2026-10-15 00:00:00', FALSE);
