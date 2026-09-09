package com.yeogidam.place.dto.response;

import com.yeogidam.place.domain.Address;
import com.yeogidam.place.repository.PlaceDecisionView;

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

    public static PlaceResponse from(PlaceDecisionView view) {
        return new PlaceResponse(
                view.placeId(),
                view.name(),
                view.category(),
                new Address(view.address(), view.roadAddress()).summary(),
                view.roadAddress(),
                view.kakaoPlaceUrl(),
                view.telephone(),
                view.thumbnailUrl(),
                view.decisionStatus());
    }
}
