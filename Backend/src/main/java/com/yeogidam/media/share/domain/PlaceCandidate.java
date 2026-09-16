package com.yeogidam.media.share.domain;

import com.yeogidam.place.domain.Place;
import com.yeogidam.place.domain.PlaceDecisionStatus;

/**
 * 공유 건에 발급된 후보 하나. 추출 사실의 사본(장소)과 사용자 해석(결정)의 쌍이다.
 * 후보는 미결정(UNDECIDED)으로 태어난다. 발급 생성자가 이 규칙을 선언하고 스키마 기본값은 이중 방어다.
 * 결정은 UNDECIDED에서만 내릴 수 있고 값은 SAVED 또는 DISCARDED뿐이다.
 * 이미 결정된 후보를 조용히 건너뛰는 것은 PlaceCandidates의 몫이라, 후보 하나는 canDecide로 묻고 decide로 바꾼다.
 */
public class PlaceCandidate {

    private final Place place;
    private PlaceDecisionStatus decision;

    public PlaceCandidate(Place place) {
        this(place, PlaceDecisionStatus.UNDECIDED);
    }

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

    public boolean canDecide() {
        return decision == PlaceDecisionStatus.UNDECIDED;
    }

    public void decide(PlaceDecisionStatus target) {
        validateTarget(target);
        if (!canDecide()) {
            throw new IllegalStateException("이미 결정된 후보입니다: " + decision);
        }
        this.decision = target;
    }

    private void validateTarget(PlaceDecisionStatus target) {
        if (target == null || !target.isDecision()) {
            throw new IllegalArgumentException("후보의 결정은 SAVED 또는 DISCARDED여야 합니다: " + target);
        }
    }

    public Place place() {
        return place;
    }

    public PlaceDecisionStatus decision() {
        return decision;
    }
}
