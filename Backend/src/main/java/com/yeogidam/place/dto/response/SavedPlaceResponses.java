package com.yeogidam.place.dto.response;

import com.yeogidam.place.repository.SavedPlaceProjection;
import java.util.List;

public record SavedPlaceResponses(
        List<SavedPlaceResponse> savedPlaces
) {

    public static SavedPlaceResponses from(List<SavedPlaceProjection> projections) {
        List<SavedPlaceResponse> savedPlaces = projections.stream()
                .map(SavedPlaceResponse::from)
                .toList();
        return new SavedPlaceResponses(savedPlaces);
    }
}
