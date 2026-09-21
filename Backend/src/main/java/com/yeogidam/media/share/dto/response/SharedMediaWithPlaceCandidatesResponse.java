package com.yeogidam.media.share.dto.response;

import com.yeogidam.media.share.repository.SharedMediaProjection;
import java.util.List;

public record SharedMediaWithPlaceCandidatesResponse(
        Long sharedMediaId,
        String thumbnailUrl,
        String caption,
        String author,
        List<PlaceCandidateResponse> places
) {
    public SharedMediaWithPlaceCandidatesResponse(
            SharedMediaProjection projection,
            List<PlaceCandidateResponse> places
    ) {
        this(
                projection.sharedMediaId(),
                projection.thumbnailUrl(),
                projection.caption(),
                projection.author(),
                places
        );
    }
}
