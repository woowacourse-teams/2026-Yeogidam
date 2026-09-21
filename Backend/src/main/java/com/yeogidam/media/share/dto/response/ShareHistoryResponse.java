package com.yeogidam.media.share.dto.response;

import com.yeogidam.media.share.repository.ShareProjection;
import java.time.Instant;

public record ShareHistoryResponse(
        Long sharedMediaId,
        Instant sharedAt,
        String thumbnailUrl,
        String caption,
        String author,
        String extractionStatus,
        String sharedUrl
) {
    public static ShareHistoryResponse from(ShareProjection projection) {
        return new ShareHistoryResponse(
                projection.sharedMediaId(),
                projection.sharedAt(),
                projection.thumbnailUrl(),
                projection.caption(),
                projection.author(),
                projection.extractionStatus(),
                projection.sharedUrl()
        );
    }
}
