package com.yeogidam.place.dto.response;

import com.yeogidam.place.repository.SavedPlaceMediaProjection;
import java.util.List;

public record SavedPlaceMediaResponses(
        List<SavedPlaceMediaResponse> media
) {
    public static SavedPlaceMediaResponses from(List<SavedPlaceMediaProjection> projections) {
        List<SavedPlaceMediaResponse> media = projections.stream()
                .map(SavedPlaceMediaResponse::from)
                .toList();
        return new SavedPlaceMediaResponses(media);
    }
}
