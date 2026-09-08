package com.yeogidam.place.repository;

import java.math.BigDecimal;

/**
 * place 테이블 한 행. DB 전용 표현이며 도메인 Place와 분리된다.
 */
public record PlaceRecord(
        Long id,
        Long reelId,
        String name,
        String category,
        String address,
        String roadAddress,
        BigDecimal latitude,
        BigDecimal longitude,
        String kakaoPlaceId,
        String kakaoPlaceUrl,
        String telephone,
        String thumbnailUrl,
        String thumbnailSource,
        String photoAttribution,
        boolean saved
) {
}
