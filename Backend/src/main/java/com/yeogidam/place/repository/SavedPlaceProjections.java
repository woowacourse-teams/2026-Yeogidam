package com.yeogidam.place.repository;

import java.util.List;

public record SavedPlaceProjections(List<SavedPlaceProjection> places) {

    public List<Long> savedPlaceIds() {
        return places.stream()
                .map(SavedPlaceProjection::savedPlaceId)
                .toList();
    }
}
