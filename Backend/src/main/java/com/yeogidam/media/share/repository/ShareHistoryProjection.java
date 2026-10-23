package com.yeogidam.media.share.repository;

import java.time.Instant;

public record ShareHistoryProjection(
        Long sharedMediaId,
        Instant createdAt,
        String thumbnailKey,
        String caption,
        String author,
        String extractionStatus,
        String failureReason,
        String sharedUrl
) {
}
