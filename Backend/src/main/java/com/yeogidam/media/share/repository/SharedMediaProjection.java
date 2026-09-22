package com.yeogidam.media.share.repository;

import java.time.Instant;

public record SharedMediaProjection(
        Long sharedMediaId,
        Instant createdAt,
        String thumbnailUrl,
        String caption,
        String author
) {
}
