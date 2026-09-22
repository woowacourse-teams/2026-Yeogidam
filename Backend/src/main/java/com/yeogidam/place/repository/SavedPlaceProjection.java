package com.yeogidam.place.repository;

import java.math.BigDecimal;
import java.time.Instant;

/**
 * 보관함 화면용 조회 상자. saved_places 한 행에 places 한 행을 붙인 모양이며 컬럼 이름을 그대로 따른다.
 */
public record SavedPlaceProjection(
        Long savedPlaceId,
        Long placeId,
        String name,
        String category,
        String landLotAddress,
        String roadAddress,
        BigDecimal latitude,
        BigDecimal longitude,
        String kakaoPlaceUrl,
        String telephone,
        String thumbnailUrl,
        String thumbnailSource,
        String thumbnailAttribution,
        Instant lastSavedAt
) {
}
