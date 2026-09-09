package com.yeogidam.place.dto.response;

import com.yeogidam.place.domain.Address;
import com.yeogidam.place.repository.SavedPlaceView;
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

    public static SavedPlaceResponse from(SavedPlaceView view) {
        return new SavedPlaceResponse(
                view.id(),
                view.name(),
                view.category(),
                new Address(view.address(), view.roadAddress()).summary(),
                view.roadAddress(),
                view.latitude(),
                view.longitude(),
                view.kakaoPlaceUrl(),
                view.telephone(),
                view.thumbnailUrl(),
                view.mediaCount());
    }
}
