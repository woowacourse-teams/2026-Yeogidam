package com.yeogidam.place.dto.response;

import com.yeogidam.place.domain.Address;
import com.yeogidam.place.repository.SavedPlaceProjection;
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

    public static SavedPlaceResponse from(SavedPlaceProjection projection) {
        return new SavedPlaceResponse(
                projection.id(),
                projection.name(),
                projection.category(),
                new Address(projection.address(), projection.roadAddress()).summary(),
                projection.roadAddress(),
                projection.latitude(),
                projection.longitude(),
                projection.kakaoPlaceUrl(),
                projection.telephone(),
                projection.thumbnailUrl(),
                projection.mediaCount());
    }
}
