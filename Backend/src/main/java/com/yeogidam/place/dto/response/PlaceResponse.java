package com.yeogidam.place.dto.response;

import com.yeogidam.place.domain.Address;
import com.yeogidam.place.repository.PlaceDecisionProjection;

public record PlaceResponse(
        Long id,
        String name,
        String category,
        String address,
        String roadAddress,
        String kakaoPlaceUrl,
        String telephone,
        String thumbnailUrl,
        String decisionStatus
) {

    public static PlaceResponse from(PlaceDecisionProjection projection) {
        return new PlaceResponse(
                projection.placeId(),
                projection.name(),
                projection.category(),
                new Address(projection.address(), projection.roadAddress()).summary(),
                projection.roadAddress(),
                projection.kakaoPlaceUrl(),
                projection.telephone(),
                projection.thumbnailUrl(),
                projection.decisionStatus());
    }
}
