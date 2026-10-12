package com.yeogidam.media.extraction.domain;

import com.yeogidam.place.domain.Place;
import java.util.List;

/**
 * 추출 결과의 일급 컬렉션. 장소를 분석 순서대로 보관한다.
 */
public class ExtractedPlaces {

    private final List<Place> places;

    public ExtractedPlaces(List<Place> places) {
        validateNotEmpty(places);
        this.places = List.copyOf(places);
    }

    private void validateNotEmpty(List<Place> places) {
        if (places == null || places.isEmpty()) {
            throw new IllegalArgumentException("추출에 성공한 게시물은 장소가 한 개 이상이어야 합니다.");
        }
    }

    public int count() {
        return places.size();
    }

    public List<Place> values() {
        return places;
    }
}
