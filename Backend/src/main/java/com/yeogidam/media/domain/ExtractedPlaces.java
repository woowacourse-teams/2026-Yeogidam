package com.yeogidam.media.domain;

import com.yeogidam.media.exception.UnselectablePlaceException;
import com.yeogidam.place.domain.PlaceDecisionStatus;
import java.util.List;

public class ExtractedPlaces {

    private final List<ExtractedPlace> places;

    public ExtractedPlaces(List<ExtractedPlace> places) {
        validateNotEmpty(places);
        this.places = List.copyOf(places);
    }

    private void validateNotEmpty(List<ExtractedPlace> places) {
        if (places == null || places.isEmpty()) {
            throw new IllegalArgumentException("추출에 성공한 미디어는 장소가 한 개 이상이어야 합니다.");
        }
    }

    public void decide(
            List<Long> placeIds,
            PlaceDecisionStatus target
    ) {
        validateKnown(placeIds);
        places.stream()
                .filter(extractedPlace -> placeIds.contains(extractedPlace.place().id()))
                .forEach(extractedPlace -> extractedPlace.decide(target));
    }

    private void validateKnown(List<Long> placeIds) {
        if (placeIds == null || placeIds.isEmpty()) {
            throw new UnselectablePlaceException("결정할 장소를 한 개 이상 선택해야 합니다.");
        }
        if (!placeIdValues().containsAll(placeIds)) {
            throw new UnselectablePlaceException("이 미디어에서 추출되지 않은 장소는 결정할 수 없습니다.");
        }
    }

    private List<Long> placeIdValues() {
        return places.stream()
                .map(extractedPlace -> extractedPlace.place().id())
                .toList();
    }

    public int count() {
        return places.size();
    }

    public List<ExtractedPlace> values() {
        return places;
    }
}
