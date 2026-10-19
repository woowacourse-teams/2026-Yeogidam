package com.yeogidam.media.extraction.repository;

public record MediaPlaceProjection(
        Long placeId,
        String thumbnailKey,
        String name,
        String category,
        String landLotAddress,
        String roadAddress
) {
}
