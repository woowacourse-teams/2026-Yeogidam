-- 회원 1(KAKAO user-1)과 회원 2(KAKAO user-2). E2E에서는 loginAsKakao("user-1")이 회원 1로 로그인된다.
INSERT INTO members (id, oauth_provider, provider_user_id, nickname, email, image_url)
VALUES (1, 'KAKAO', 'user-1', 'kakao-user-1', 'user-1@example.com', NULL),
       (2, 'KAKAO', 'user-2', 'kakao-user-2', 'user-2@example.com', NULL);
