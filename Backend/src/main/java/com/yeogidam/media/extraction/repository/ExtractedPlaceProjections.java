package com.yeogidam.media.extraction.repository;

import com.yeogidam.place.exception.PlaceErrorCode;
import com.yeogidam.place.exception.PlaceException;
import java.util.LinkedHashSet;
import java.util.List;

/**
 * 게시물 하나에서 추출된 장소 묶음. 장소마다 우리 DB의 id와 카카오 장소 id를 함께 든다.
 * 앱이 보낸 카카오 장소 id를 우리 장소 id로 바꾸되, 이 게시물에서 추출되지 않은 장소면 거절하는 규칙을 가진다.
 * 순수 규칙이라 읽기 모델에 둔다.
 */
public record ExtractedPlaceProjections(
        List<ExtractedPlaceProjection> places
) {

    /**
     * 요청한 순서를 지키고 같은 id는 한 번만 센다. 이 게시물에서 추출되지 않은 장소가 하나라도 있으면 전체를 거절한다.
     */
    public List<Long> getPlaceIds(List<String> kakaoPlaceIds) {
        return new LinkedHashSet<>(kakaoPlaceIds).stream()
                .map(this::getPlaceId)
                .toList();
    }

    private Long getPlaceId(String kakaoPlaceId) {
        return places.stream()
                .filter(place -> place.kakaoPlaceId().equals(kakaoPlaceId))
                .map(ExtractedPlaceProjection::placeId)
                .findFirst()
                .orElseThrow(() -> new PlaceException(PlaceErrorCode.NOT_ONBOARDING_PLACE));
    }
}
