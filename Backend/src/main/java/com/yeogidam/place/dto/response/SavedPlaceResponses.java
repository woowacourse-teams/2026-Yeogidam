package com.yeogidam.place.dto.response;

import java.util.List;

public record SavedPlaceResponses(
        List<SavedPlaceResponse> savedPlaces
) {
    public static SavedPlaceResponses fromResponses(List<SavedPlaceResponse> savedPlaces) {
        return new SavedPlaceResponses(savedPlaces);
    }
}
