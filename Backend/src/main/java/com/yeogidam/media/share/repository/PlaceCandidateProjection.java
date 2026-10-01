package com.yeogidam.media.share.repository;

public record PlaceCandidateProjection(
        Long sharedMediaId,
        Long candidateId,
        Long placeId,
        String thumbnailKey,
        String name,
        String category,
        String landLotAddress,
        String roadAddress
) {
}
