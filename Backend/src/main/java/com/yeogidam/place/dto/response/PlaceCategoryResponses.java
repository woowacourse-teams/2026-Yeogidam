package com.yeogidam.place.dto.response;

import com.yeogidam.place.domain.PlaceCategory;
import java.util.List;

public record PlaceCategoryResponses(
        List<PlaceCategoryResponse> categories
) {
    public static PlaceCategoryResponses from(List<PlaceCategory> placeCategories) {
        List<PlaceCategoryResponse> categories = placeCategories.stream()
                .map(PlaceCategoryResponse::from)
                .toList();
        return new PlaceCategoryResponses(categories);
    }
}
