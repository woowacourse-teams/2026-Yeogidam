package com.yeogidam.place.dto.response;

import com.yeogidam.place.domain.Address;
import com.yeogidam.place.repository.SavedPlaceProjection;
import java.math.BigDecimal;
import java.time.Instant;

public record SavedPlaceResponse(
        Long placeId,
        String name,
        String category,
        String landLotAddress,
        String roadAddress,
        String summaryAddress,
        BigDecimal latitude,
        BigDecimal longitude,
        String kakaoPlaceUrl,
        String telephone,
        String thumbnailUrl,
        String thumbnailSource,
        String thumbnailAttribution,
        Instant lastSavedAt
) {
    public SavedPlaceResponse(SavedPlaceProjection projection) {
        this(
                projection.placeId(),
                projection.name(),
                projection.category(),
                projection.landLotAddress(),
                projection.roadAddress(),
                new Address(projection.landLotAddress(), projection.roadAddress()).summary(),
                projection.latitude(),
                projection.longitude(),
                projection.kakaoPlaceUrl(),
                projection.telephone(),
                projection.thumbnailUrl(),
                projection.thumbnailSource(),
                projection.thumbnailAttribution(),
                projection.lastSavedAt()
        );
    }
}
