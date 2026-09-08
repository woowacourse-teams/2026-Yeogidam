package com.yeogidam.place.dto.response;

import java.math.BigDecimal;

public record SavedPlaceResponse(
        Long id,
        String name,
        String category,
        String address,
        String roadAddress,
        BigDecimal latitude,
        BigDecimal longitude,
        String kakaoPlaceUrl,
        String telephone,
        String thumbnailUrl,
        int mediaCount
) {
}
