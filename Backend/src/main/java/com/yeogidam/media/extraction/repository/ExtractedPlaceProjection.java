package com.yeogidam.media.extraction.repository;

import com.yeogidam.place.domain.MapProvider;

public record ExtractedPlaceProjection(
        Long placeId,
        String mapProvider,
        String externalPlaceId
) {

    public boolean isKakaoPlace(String kakaoPlaceId) {
        return MapProvider.KAKAO.name().equals(mapProvider) && externalPlaceId.equals(kakaoPlaceId);
    }
}
