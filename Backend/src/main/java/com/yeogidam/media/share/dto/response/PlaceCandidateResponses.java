package com.yeogidam.media.share.dto.response;

import com.yeogidam.media.share.repository.PlaceCandidateProjection;
import java.util.List;

public record PlaceCandidateResponses(
        List<PlaceCandidateResponse> places
) {
    public static PlaceCandidateResponses from(List<PlaceCandidateProjection> projections) {
        return new PlaceCandidateResponses(projections.stream()
                .map(PlaceCandidateResponse::from)
                .toList());
    }
}
