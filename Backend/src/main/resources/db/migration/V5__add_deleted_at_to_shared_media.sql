-- 회원이 보관함에서 게시글을 지운 시각. 공유 데이터를 지우지 않고 시각만 채워서(soft delete) 히스토리와 제보 데이터를 남긴다.
-- 기존 공유는 NULL로 남아 지운 게시글로 바뀌지 않는다.
ALTER TABLE shared_media
    ADD COLUMN deleted_at TIMESTAMP(6) NULL;
