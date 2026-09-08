package com.yeogidam.place.service;

import java.math.BigDecimal;

/**
 * 지도 검색(카카오) 어댑터의 산출물. 검증 없이 담는다.
 * 썸네일은 카카오가 주지 않아 별도 출처(구글 폴백 예정)에서 채운다.
 */
public record SearchedPlace(
        String name,
        String category,
        String landLotAddress,
        String roadAddress,
        BigDecimal latitude,
        BigDecimal longitude,
        String kakaoPlaceId,
        String kakaoPlaceUrl,
        String telephone,
        String thumbnailUrl
) {
}
