package com.yeogidam.media.extraction.repository;

import com.yeogidam.place.domain.MapProvider;
import com.yeogidam.place.domain.PlaceExternalSource;
import java.math.BigDecimal;

/**
 * 히스토리 장소 목록의 장소 한 곳으로, 공유한 게시물에서 추출된 장소에 회원의 보관함 항목 ID를 붙인다.
 * 회원이 보관함에 두지 않은 장소면 savedPlaceId를 null로 둔다.
 */
public record MediaPlaceProjection(
        Long placeId,
        Long savedPlaceId,
        String thumbnailKey,
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
        String telephone
) {

    public PlaceExternalSource externalSource() {
        return new PlaceExternalSource(MapProvider.valueOf(mapProvider), externalPlaceId, kakaoPlaceUrl);
    }
}
