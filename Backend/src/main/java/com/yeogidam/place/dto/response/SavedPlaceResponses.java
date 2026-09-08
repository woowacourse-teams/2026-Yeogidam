package com.yeogidam.place.dto.response;

import java.util.List;

public record SavedPlaceResponses(
        List<SavedPlaceResponse> savedPlaces
) {
}
