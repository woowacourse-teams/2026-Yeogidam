package com.yeogidam.place.repository;

import java.math.BigDecimal;

/**
 * 지도 핀 하나. 같은 장소(이름·좌표가 같은 행)를 묶은 조회 전용 표현이다.
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
        int reelCount
) {
}
