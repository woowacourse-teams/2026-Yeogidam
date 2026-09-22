package com.yeogidam.media.share.repository;

import java.time.Instant;

public record SharedMediaSummaryProjection(
        Long sharedMediaId,
        Instant createdAt,
        String thumbnailUrl,
        String caption,
        String author
) {
}
