-- 회원 1(KAKAO kakao-1, 빈) 한 명. MemberDaoTest와 RefreshSessionDaoTest가 쓴다.
INSERT INTO members (id, oauth_provider, provider_user_id, nickname, email, image_url)
VALUES (1, 'KAKAO', 'kakao-1', '빈', 'bean@example.com', 'https://img.example.com/bean');
