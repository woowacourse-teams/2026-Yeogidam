package com.yeogidam.place.repository;

import java.time.LocalDateTime;

/**
 * saved_place 테이블 한 행. 회원과 장소당 하나다.
 */
public record SavedPlaceRecord(
        Long id,
        Long memberId,
        Long placeId,
        LocalDateTime firstSavedAt,
        LocalDateTime lastSavedAt
) {
}
