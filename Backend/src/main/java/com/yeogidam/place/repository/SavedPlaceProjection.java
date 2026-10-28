package com.yeogidam.place.repository;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

/**
 * 보관함 화면용 조회 상자. 저장한 장소 정보와 그 장소가 속한 회원의 폴더 ID 목록을 담는다.
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
        Instant lastSavedAt,
        List<Long> folderIds
) {
}
