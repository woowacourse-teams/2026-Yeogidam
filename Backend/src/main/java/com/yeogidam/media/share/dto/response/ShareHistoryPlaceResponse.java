package com.yeogidam.media.share.dto.response;

import com.yeogidam.media.extraction.repository.MediaPlaceProjection;
import com.yeogidam.place.domain.PlaceCategory;
import com.yeogidam.place.domain.PlaceCategoryClassifier;
import com.yeogidam.place.domain.PlaceExternalSource;
import java.math.BigDecimal;

/**
 * 히스토리 장소 목록의 장소 한 곳으로, 필드 이름과 값은 보관함 게시물의 장소(SavedMediaPlaceResponse)와 같다.
 * 지금 앱이 읽는 필드 뒤에 보관함 항목 ID, 카테고리 코드와 이름, 장소 상세 필드를 붙인다.
 */
public record ShareHistoryPlaceResponse(
        Long placeId,
        String thumbnailUrl,
        String name,
        String category,
        String landLotAddress,
        String roadAddress,
        Long savedPlaceId,
        String categoryCode,
        String categoryName,
        BigDecimal latitude,
        BigDecimal longitude,
        String kakaoPlaceUrl,
        String mapProvider,
        String countryCode,
        String placeUrl,
        String telephone
) {
    public static ShareHistoryPlaceResponse from(MediaPlaceProjection projection, String thumbnailUrl) {
        PlaceCategory category = PlaceCategoryClassifier.classify(projection.category());
        PlaceExternalSource externalSource = projection.externalSource();
        return new ShareHistoryPlaceResponse(
                projection.placeId(),
                thumbnailUrl,
                projection.name(),
                projection.category(),
                projection.landLotAddress(),
                projection.roadAddress(),
                projection.savedPlaceId(),
                category.getCode(),
                category.getName(),
                projection.latitude(),
                projection.longitude(),
                projection.kakaoPlaceUrl(),
                externalSource.mapProvider().name(),
                projection.countryCode(),
                externalSource.mapUrl(projection.name()),
                projection.telephone()
        );
    }
}
