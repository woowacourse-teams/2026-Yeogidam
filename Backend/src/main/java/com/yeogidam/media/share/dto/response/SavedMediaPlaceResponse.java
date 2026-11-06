package com.yeogidam.media.share.dto.response;

import com.yeogidam.media.extraction.repository.SavedMediaPlaceProjection;
import com.yeogidam.place.domain.PlaceCategory;
import com.yeogidam.place.domain.PlaceCategoryClassifier;
import java.math.BigDecimal;
import java.util.function.UnaryOperator;

/**
 * 보관함 게시물 하나에 붙는 장소 한 곳으로, 필드 이름은 보관함 응답(SavedPlaceResponse)과 같다.
 */
public record SavedMediaPlaceResponse(
        Long savedPlaceId,
        Long placeId,
        String name,
        String category,
        String categoryCode,
        String categoryName,
        String landLotAddress,
        String roadAddress,
        BigDecimal latitude,
        BigDecimal longitude,
        String kakaoPlaceUrl,
        String telephone,
        String thumbnailUrl
) {
    public static SavedMediaPlaceResponse from(
            SavedMediaPlaceProjection projection,
            UnaryOperator<String> thumbnailUrlResolver
    ) {
        PlaceCategory category = PlaceCategoryClassifier.classify(projection.category());
        return new SavedMediaPlaceResponse(
                projection.savedPlaceId(),
                projection.placeId(),
                projection.name(),
                projection.category(),
                category.getCode(),
                category.getName(),
                projection.landLotAddress(),
                projection.roadAddress(),
                projection.latitude(),
                projection.longitude(),
                projection.kakaoPlaceUrl(),
                projection.telephone(),
                thumbnailUrlResolver.apply(projection.thumbnailKey())
        );
    }
}
