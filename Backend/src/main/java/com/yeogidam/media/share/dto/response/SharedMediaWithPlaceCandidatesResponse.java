package com.yeogidam.media.share.dto.response;

import com.yeogidam.media.share.repository.SharedMediaSummaryProjection;
import java.util.List;

public record SharedMediaWithPlaceCandidatesResponse(
        Long sharedMediaId,
        String thumbnailUrl,
        String caption,
        String author,
        List<PlaceCandidateResponse> places
) {
    public static SharedMediaWithPlaceCandidatesResponse from(
            SharedMediaSummaryProjection projection,
            List<PlaceCandidateResponse> places
    ) {
        return new SharedMediaWithPlaceCandidatesResponse(
                projection.sharedMediaId(),
                projection.thumbnailUrl(),
                projection.caption(),
                projection.author(),
                places
        );
    }
}
