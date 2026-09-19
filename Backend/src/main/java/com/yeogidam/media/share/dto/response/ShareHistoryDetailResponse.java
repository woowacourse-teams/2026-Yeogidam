package com.yeogidam.media.share.dto.response;

import com.yeogidam.media.share.repository.PlaceCandidateProjection;
import com.yeogidam.media.share.repository.ShareHistoryDetailProjection;
import java.time.Instant;
import java.util.List;

public record ShareHistoryDetailResponse(
        Long sharedMediaId,
        Instant sharedAt,
        String thumbnailUrl,
        String caption,
        String author,
        String extractionStatus,
        String failureReason,
        String sharedUrl,
        List<PlaceCandidateResponse> places
) {
    public ShareHistoryDetailResponse(
            ShareHistoryDetailProjection projection,
            List<PlaceCandidateProjection> placeProjections
    ) {
        this(
                projection.sharedMediaId(),
                projection.sharedAt(),
                projection.thumbnailUrl(),
                projection.caption(),
                projection.author(),
                projection.extractionStatus(),
                projection.failureReason(),
                projection.sharedUrl(),
                placeProjections.stream()
                        .map(PlaceCandidateResponse::new)
                        .toList()
        );
    }
}
