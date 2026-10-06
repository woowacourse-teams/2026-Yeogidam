package com.yeogidam.media.share.dto.response;

import com.yeogidam.media.extraction.repository.MediaPlaceProjection;

public record ShareHistoryPlaceResponse(
        Long placeId,
        String thumbnailUrl,
        String name,
        String category,
        String landLotAddress,
        String roadAddress
) {
    public static ShareHistoryPlaceResponse from(MediaPlaceProjection projection, String thumbnailUrl) {
        return new ShareHistoryPlaceResponse(
                projection.placeId(),
                thumbnailUrl,
                projection.name(),
                projection.category(),
                projection.landLotAddress(),
                projection.roadAddress()
        );
    }
}
