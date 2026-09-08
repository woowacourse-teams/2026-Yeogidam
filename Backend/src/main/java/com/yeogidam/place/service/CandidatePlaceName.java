package com.yeogidam.place.service;

public record CandidatePlaceName(
        String value
) {

    public CandidatePlaceName {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("후보 장소 이름이 비어 있습니다.");
        }
    }
}
