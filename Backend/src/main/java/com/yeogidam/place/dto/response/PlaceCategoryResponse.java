package com.yeogidam.place.dto.response;

import com.yeogidam.place.domain.PlaceCategory;

public record PlaceCategoryResponse(
        String code,
        String name
) {
    public static PlaceCategoryResponse from(PlaceCategory category) {
        return new PlaceCategoryResponse(category.getCode(), category.getName());
    }
}
