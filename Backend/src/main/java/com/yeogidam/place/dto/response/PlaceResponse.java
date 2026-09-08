package com.yeogidam.place.dto.response;

public record PlaceResponse(
        Long id,
        String name,
        String category,
        String address,
        String roadAddress,
        String kakaoPlaceUrl,
        String telephone,
        String thumbnailUrl,
        boolean saved
) {
}
