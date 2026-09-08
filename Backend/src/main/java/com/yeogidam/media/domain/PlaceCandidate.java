package com.yeogidam.media.domain;

import com.yeogidam.place.domain.Place;
import com.yeogidam.place.domain.PlaceDecisionStatus;

/**
 * 공유 건에 발급된 후보 하나. 추출 사실의 사본(장소)과 사용자 해석(결정)의 쌍이다.
 * 결정은 UNDECIDED에서만 내릴 수 있고, 이미 결정된 대상에 대한 요청은 조용히 무시한다.
 */
public class PlaceCandidate {

    private final Place place;
    private PlaceDecisionStatus decision;

    public PlaceCandidate(
            Place place,
            PlaceDecisionStatus decision
    ) {
        validate(place, decision);
        this.place = place;
        this.decision = decision;
    }

    private void validate(Place place, PlaceDecisionStatus decision) {
        if (place == null) {
            throw new IllegalArgumentException("장소가 비어 있습니다.");
        }
        if (decision == null) {
            throw new IllegalArgumentException("결정 상태가 비어 있습니다.");
        }
    }

    public boolean decide(PlaceDecisionStatus target) {
        if (decision != PlaceDecisionStatus.UNDECIDED) {
            return false;
        }
        this.decision = target;
        return true;
    }

    public Place place() {
        return place;
    }

    public PlaceDecisionStatus decision() {
        return decision;
    }
}
