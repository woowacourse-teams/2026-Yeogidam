package com.yeogidam.media.share.domain;

import com.yeogidam.media.exception.MediaErrorCode;
import com.yeogidam.media.exception.MediaException;
import com.yeogidam.place.domain.PlaceDecisionStatus;
import java.util.List;

/**
 * 한 공유 건(SharedInstagramMedia)에 발급된 후보 전부의 일급 컬렉션.
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

    /**
     * 고른 장소 중 아직 미결정인 후보만 결정하고, 실제로 바뀐 장소 id를 돌려준다.
     * 이미 결정된 후보는 건너뛰므로 같은 장소를 다시 골라도 멱등이고, 버린 장소는 다시 저장되지 않는다.
     * 결정 값이 SAVED와 DISCARDED뿐이라는 검증은 상태를 바꾸는 PlaceCandidate가 맡는다.
     */
    public List<Long> decide(
            List<Long> placeIds,
            PlaceDecisionStatus target
    ) {
        validateKnown(placeIds);
        List<PlaceCandidate> decidable = decidableAmong(placeIds);
        decidable.forEach(placeCandidate -> placeCandidate.decide(target));
        return decidable.stream()
                .map(placeCandidate -> placeCandidate.place().id())
                .toList();
    }

    private List<PlaceCandidate> decidableAmong(List<Long> placeIds) {
        return places.stream()
                .filter(placeCandidate -> placeIds.contains(placeCandidate.place().id()))
                .filter(PlaceCandidate::canDecide)
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
