package com.yeogidam.place.dto.response;

import com.yeogidam.place.repository.SavedPlaceProjection;
import java.math.BigDecimal;
import java.time.Instant;

public record SavedPlaceResponse(
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
        String thumbnailUrl,
        String thumbnailSource,
        Instant lastSavedAt
) {
    public static SavedPlaceResponse from(SavedPlaceProjection projection, String placeThumbnailUrl) {
        return new SavedPlaceResponse(
                projection.savedPlaceId(),
                projection.placeId(),
                projection.name(),
                projection.category(),
                projection.landLotAddress(),
                projection.roadAddress(),
                projection.latitude(),
                projection.longitude(),
                projection.kakaoPlaceUrl(),
                projection.telephone(),
                placeThumbnailUrl,
                projection.thumbnailSource(),
                projection.lastSavedAt()
        );
    }
}
