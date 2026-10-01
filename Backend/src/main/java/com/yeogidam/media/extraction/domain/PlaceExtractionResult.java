package com.yeogidam.media.extraction.domain;

public record PlaceExtractionResult(ExtractedPlaces places) {

    public PlaceExtractionResult {
        if (places == null) {
            throw new IllegalArgumentException("추출 결과의 장소 목록은 필수입니다.");
        }
    }
}
