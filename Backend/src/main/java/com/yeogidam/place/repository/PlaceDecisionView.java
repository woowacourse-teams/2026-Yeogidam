package com.yeogidam.place.repository;

import java.math.BigDecimal;

/**
 * 미디어 상세 조회 전용 프로젝션. 전역 장소 사실에 그 미디어에서의 결정 상태를 붙인 것이다.
 */
public record PlaceDecisionView(
        Long placeId,
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
        String decisionStatus
) {
}
