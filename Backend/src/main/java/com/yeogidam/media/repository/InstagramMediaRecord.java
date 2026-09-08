package com.yeogidam.media.repository;

import java.time.LocalDateTime;

/**
 * instagram_media 테이블 한 행. DB 전용 표현이며 도메인 InstagramMedia와 분리된다.
 * 제목, 썸네일, 계정명, 공유 시각은 규칙이 없어 도메인에는 없고 여기에만 있다.
 * sharedUrl은 받은 원본을 그대로 보관한다(실패 미디어의 "원본 릴스로 이동" 근거).
 */
public record InstagramMediaRecord(
        Long id,
        Long userId,
        String sharedUrl,
        String mediaShortcode,
        String title,
        String caption,
        String thumbnailUrl,
        String authorUsername,
        String extractionStatus,
        String failureReason,
        int processingVersion,
        LocalDateTime createdAt
) {
}
