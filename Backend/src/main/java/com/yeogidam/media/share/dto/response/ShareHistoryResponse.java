package com.yeogidam.media.share.dto.response;

import com.yeogidam.media.share.repository.ShareHistoryProjection;
import java.time.Instant;

public record ShareHistoryResponse(
        Long sharedMediaId,
        Instant createdAt,
        String thumbnailUrl,
        String caption,
        String author,
        String extractionStatus,
        String failureReason,
        String sharedUrl
) {
    public static ShareHistoryResponse from(ShareHistoryProjection projection) {
        return new ShareHistoryResponse(
                projection.sharedMediaId(),
                projection.createdAt(),
                projection.thumbnailUrl(),
                projection.caption(),
                projection.author(),
                projection.extractionStatus(),
                projection.failureReason(),
                projection.sharedUrl()
        );
    }
}
