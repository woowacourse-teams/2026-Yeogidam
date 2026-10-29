package com.yeogidam.place.repository;

import java.math.BigDecimal;
import java.time.Instant;

/**
 * 보관함 화면용 조회 상자. 저장한 장소 정보와 저장 시각을 담는다.
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
        String thumbnailKey,
        String thumbnailSource,
        Instant lastSavedAt
) {
}
