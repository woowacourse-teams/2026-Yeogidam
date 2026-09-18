package com.yeogidam.media.share.dto.response;

import com.yeogidam.media.share.repository.SharedMediaProjection;
import java.util.List;

public record PlaceCandidateSharedMediaResponse(
        Long sharedMediaId,
        String thumbnailUrl,
        String caption,
        String author,
        List<PlaceCandidateResponse> places
) {
    public PlaceCandidateSharedMediaResponse(
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
