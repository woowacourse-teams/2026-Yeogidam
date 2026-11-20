package com.yeogidam.place.repository;

import com.yeogidam.place.domain.MapProvider;
import com.yeogidam.place.domain.PlaceExternalSource;
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
        String mapProvider,
        String externalPlaceId,
        String countryCode,
        String kakaoPlaceUrl,
        String telephone,
        String thumbnailKey,
        String thumbnailSource,
        Instant lastSavedAt
) {

    public PlaceExternalSource externalSource() {
        return new PlaceExternalSource(MapProvider.valueOf(mapProvider), externalPlaceId, kakaoPlaceUrl);
    }
}
