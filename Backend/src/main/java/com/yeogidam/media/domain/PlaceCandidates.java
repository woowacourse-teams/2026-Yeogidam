package com.yeogidam.media.domain;

import com.yeogidam.media.exception.MediaErrorCode;
import com.yeogidam.media.exception.MediaException;
import com.yeogidam.place.domain.PlaceDecisionStatus;
import java.util.List;

/**
 * 한 공유 건(MediaShare)에 발급된 후보 전부의 일급 컬렉션.
 * 이 공유 건의 후보 중에서만 결정할 수 있다는 선택 규칙을 안다.
 */
public class PlaceCandidates {

    private final List<PlaceCandidate> places;

    public PlaceCandidates(List<PlaceCandidate> places) {
        validateNotEmpty(places);
        this.places = List.copyOf(places);
    }

    private void validateNotEmpty(List<PlaceCandidate> places) {
        if (places == null || places.isEmpty()) {
            throw new IllegalArgumentException("추출에 성공한 미디어는 장소가 한 개 이상이어야 합니다.");
        }
    }

    public List<Long> decide(
            List<Long> placeIds,
            PlaceDecisionStatus target
    ) {
        validateKnown(placeIds);
        return places.stream()
                .filter(placeCandidate -> placeIds.contains(placeCandidate.place().id()))
                .filter(placeCandidate -> placeCandidate.decide(target))
                .map(placeCandidate -> placeCandidate.place().id())
                .toList();
    }

    private void validateKnown(List<Long> placeIds) {
        if (placeIds == null || placeIds.isEmpty()) {
            throw new MediaException(MediaErrorCode.EMPTY_PLACE_SELECTION);
        }
        if (!placeIdValues().containsAll(placeIds)) {
            throw new MediaException(MediaErrorCode.NOT_A_CANDIDATE);
        }
    }

    private List<Long> placeIdValues() {
        return places.stream()
                .map(placeCandidate -> placeCandidate.place().id())
                .toList();
    }

    public int count() {
        return places.size();
    }

    public List<PlaceCandidate> values() {
        return places;
    }
}
