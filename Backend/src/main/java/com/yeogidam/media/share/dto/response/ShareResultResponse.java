package com.yeogidam.media.share.dto.response;

import com.yeogidam.media.share.repository.PlaceCandidateProjection;
import com.yeogidam.media.share.repository.ShareResultProjection;
import java.time.Instant;
import java.util.List;

public record ShareResultResponse(
        Long sharedMediaId,
        Instant sharedAt,
        String thumbnailUrl,
        String caption,
        String author,
        String extractionStatus,
        String failureReason,
        String originalUrl,
        List<PlaceCandidateResponse> places
) {
    public ShareResultResponse(
            ShareResultProjection projection,
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
                projection.originalUrl(),
                placeProjections.stream()
                        .map(PlaceCandidateResponse::new)
                        .toList()
        );
    }
}
