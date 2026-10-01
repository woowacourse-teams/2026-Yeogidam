package com.yeogidam.media.share.dto.response;

import com.yeogidam.media.share.repository.PlaceCandidateProjection;

public record PlaceCandidateResponse(
        Long placeId,
        String thumbnailUrl,
        String name,
        String category,
        String landLotAddress,
        String roadAddress
) {
    public static PlaceCandidateResponse from(
            PlaceCandidateProjection projection,
            String placeThumbnailUrl
    ) {
        return new PlaceCandidateResponse(
                projection.placeId(),
                placeThumbnailUrl,
                projection.name(),
                projection.category(),
                projection.landLotAddress(),
                projection.roadAddress()
        );
    }
}
