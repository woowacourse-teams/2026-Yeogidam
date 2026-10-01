package com.yeogidam.media.share.dto.response;

import com.yeogidam.media.share.repository.PlaceCandidateProjection;
import java.util.List;
import java.util.Map;

public record PlaceCandidateResponses(
        List<PlaceCandidateResponse> places
) {
    public static PlaceCandidateResponses from(
            List<PlaceCandidateProjection> projections,
            Map<Long, String> placeThumbnailUrls
    ) {
        return new PlaceCandidateResponses(projections.stream()
                .map(projection -> PlaceCandidateResponse.from(
                        projection, placeThumbnailUrls.get(projection.placeId())))
                .toList());
    }
}
