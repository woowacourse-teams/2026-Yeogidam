package com.yeogidam.place.dto.response;

import java.util.List;

public record SavedPlaceMediaResponses(
        List<SavedPlaceMediaResponse> media
) {
    public static SavedPlaceMediaResponses from(List<SavedPlaceMediaResponse> responses) {
        return new SavedPlaceMediaResponses(responses);
    }
}
