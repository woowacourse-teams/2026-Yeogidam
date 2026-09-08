package com.yeogidam.media.repository;

import java.time.LocalDateTime;

/**
 * 공유 사건에 게시물 정보를 붙인 조회 전용 프로젝션.
 * 히스토리와 상세 화면이 공유 건 단위라 이 모양으로 바로 응답까지 간다.
 */
public record MediaShareView(
        Long shareId,
        Long userId,
        Long mediaId,
        String sharedUrl,
        LocalDateTime sharedAt,
        String title,
        String caption,
        String thumbnailUrl,
        String authorUsername,
        String extractionStatus,
        String failureReason,
        int processingVersion
) {
}
