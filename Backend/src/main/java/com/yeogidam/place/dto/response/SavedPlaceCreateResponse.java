package com.yeogidam.place.dto.response;

import com.yeogidam.place.service.SavedPlaceSaveResult;

public record SavedPlaceCreateResponse(
        Long savedPlaceId
) {
    public static SavedPlaceCreateResponse from(SavedPlaceSaveResult result) {
        return new SavedPlaceCreateResponse(result.savedPlaceId());
    }
}
