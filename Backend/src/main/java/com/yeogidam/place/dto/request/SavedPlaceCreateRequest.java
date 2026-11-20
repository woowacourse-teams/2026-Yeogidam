package com.yeogidam.place.dto.request;

import jakarta.validation.constraints.NotNull;

public record SavedPlaceCreateRequest(
        @NotNull
        Long sharedMediaId,
        @NotNull
        Long placeId
) {
}
