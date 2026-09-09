package com.yeogidam.place.domain;

public record PlaceName(
        String value
) {

    public PlaceName {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("장소 이름이 비어 있습니다.");
        }
    }
}
