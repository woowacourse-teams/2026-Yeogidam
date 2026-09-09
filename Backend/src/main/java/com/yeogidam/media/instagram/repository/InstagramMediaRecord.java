package com.yeogidam.media.instagram.repository;

import java.time.LocalDateTime;

/**
 * instagram_media 테이블 한 행. 게시물 전용 DB 표현이며 도메인 InstagramMedia와 분리된다.
 * shortcode로 유일하고, 사용자와 공유 사건(원본 URL 포함)은 media_share가 든다.
 */
public record InstagramMediaRecord(
        Long id,
        String mediaShortcode,
        String caption,
        String thumbnailUrl,
        String author,
        String extractionStatus,
        String failureReason,
        int processingVersion,
        LocalDateTime createdAt
) {
}
