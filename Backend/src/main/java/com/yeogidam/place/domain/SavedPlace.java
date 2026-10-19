package com.yeogidam.place.domain;

import java.time.Instant;
import lombok.Getter;

/** 회원이 장소를 보관함에 저장한 정보. */
@Getter
public class SavedPlace {

    private final Long memberId;
    private final Long placeId;
    private final Instant lastSavedAt;

    public SavedPlace(Long memberId, Long placeId, Instant lastSavedAt) {
        validate(memberId, placeId, lastSavedAt);
        this.memberId = memberId;
        this.placeId = placeId;
        this.lastSavedAt = lastSavedAt;
    }

    private void validate(
            Long memberId,
            Long placeId,
            Instant lastSavedAt
    ) {
        if (memberId == null) {
            throw new IllegalArgumentException("저장한 회원이 비어 있습니다.");
        }
        if (placeId == null) {
            throw new IllegalArgumentException("저장할 장소가 비어 있습니다.");
        }
        if (lastSavedAt == null) {
            throw new IllegalArgumentException("저장 시각이 비어 있습니다.");
        }
    }
}
