package com.yeogidam.place.repository;

import java.math.BigDecimal;

/**
 * 지도 핀 하나. 그 사용자가 SAVED로 결정한 전역 장소와, 연결된 미디어 수다.
 */
public record SavedPlaceRecord(
        Long id,
        String name,
        String category,
        String address,
        String roadAddress,
        BigDecimal latitude,
        BigDecimal longitude,
        String kakaoPlaceUrl,
        String telephone,
        String thumbnailUrl,
        int mediaCount
) {
}
