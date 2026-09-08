package com.yeogidam.place.repository;

import java.math.BigDecimal;

/**
 * place 테이블 한 행. 전역 장소 사실(사용자 무관)의 DB 표현이다.
 */
public record PlaceRecord(
        Long id,
        String kakaoPlaceId,
        String name,
        String category,
        String address,
        String roadAddress,
        BigDecimal latitude,
        BigDecimal longitude,
        String kakaoPlaceUrl,
        String telephone,
        String thumbnailUrl,
        String thumbnailSource,
        String photoAttribution
) {
}
