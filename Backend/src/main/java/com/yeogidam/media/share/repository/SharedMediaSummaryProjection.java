package com.yeogidam.media.share.repository;

import java.time.Instant;

public record SharedMediaSummaryProjection(
        Long sharedMediaId,
        Instant createdAt,
        String thumbnailKey,
        String caption,
        String author
) {
}
