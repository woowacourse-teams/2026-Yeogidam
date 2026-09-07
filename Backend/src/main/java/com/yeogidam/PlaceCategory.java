package com.yeogidam;

public record PlaceCategory(
        String value
) {
    public PlaceCategory {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("장소 카테고리가 비어 있습니다.");
        }
    }
}
