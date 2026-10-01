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
            String instagramThumbnailUrl,
            List<PlaceCandidateResponse> places
    ) {
        return new SharedMediaWithPlaceCandidatesResponse(
                projection.sharedMediaId(),
                instagramThumbnailUrl,
                projection.caption(),
                projection.author(),
                places
        );
    }
}
