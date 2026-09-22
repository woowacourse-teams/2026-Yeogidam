package com.yeogidam.media.share.repository;

import java.time.Instant;

public record ShareProjection(
        Long sharedMediaId,
        Instant createdAt,
        String thumbnailUrl,
        String caption,
        String author,
        String extractionStatus,
        String sharedUrl
) {
}
