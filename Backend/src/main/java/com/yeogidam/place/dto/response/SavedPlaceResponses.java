package com.yeogidam.place.dto.response;

import java.util.List;

/**
 * List<SavedPlaceProjection>을 받는 부생성자는 제네릭 소거로 정식 생성자와 시그니처가 겹쳐 둘 수 없다.
 * 그래서 목록 변환은 서비스가 하고, 항목 변환만 SavedPlaceResponse의 부생성자가 맡는다.
 */
public record SavedPlaceResponses(
        List<SavedPlaceResponse> savedPlaces
) {
}
