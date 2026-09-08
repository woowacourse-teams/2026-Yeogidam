package com.yeogidam.media.repository;

import java.time.LocalDateTime;

/**
 * media_share 테이블 한 행. 특정 사용자가 게시물을 공유한 사건 하나다.
 * sharedUrl은 받은 원본을 그대로 보관한다(실패 공유의 "원본 릴스로 이동" 근거).
 */
public record MediaShareRecord(
        Long id,
        Long userId,
        Long mediaId,
        String sharedUrl,
        LocalDateTime createdAt
) {
}
