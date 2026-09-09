package com.yeogidam.place.dto.response;

import com.yeogidam.place.repository.SavedPlaceView;
import java.util.List;

public record SavedPlaceResponses(
        List<SavedPlaceResponse> savedPlaces
) {

    public static SavedPlaceResponses from(List<SavedPlaceView> views) {
        List<SavedPlaceResponse> savedPlaces = views.stream()
                .map(SavedPlaceResponse::from)
                .toList();
        return new SavedPlaceResponses(savedPlaces);
    }
}
