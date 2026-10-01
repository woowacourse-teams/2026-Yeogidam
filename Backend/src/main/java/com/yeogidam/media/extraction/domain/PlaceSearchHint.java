package com.yeogidam.media.extraction.domain;

import java.util.List;

/** 캡션에서 언급한 한 장소와 검색에 도움이 되는 단서. */
public record PlaceSearchHint(
        String nameInCaption,
        String nameSearchHint,
        List<String> accountHints,
        List<LocationHint> locationHints,
        String categoryHint
) {
    public PlaceSearchHint {
        validateName(nameInCaption, "캡션 장소명");
        validateOptional(nameSearchHint, "검색 이름 단서");
        validateOptional(categoryHint, "업종 단서");
        accountHints = copyRequired(accountHints, "계정 단서");
        locationHints = copyRequired(locationHints, "위치 단서");
    }

    private static void validateName(String value, String label) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(label + "은 필수입니다.");
        }
    }

    private static void validateOptional(String value, String label) {
        if (value != null && value.isBlank()) {
            throw new IllegalArgumentException(label + "은 빈 문자열일 수 없습니다.");
        }
    }

    private static <T> List<T> copyRequired(List<T> values, String label) {
        if (values == null) {
            throw new IllegalArgumentException(label + " 목록은 필수입니다.");
        }
        return List.copyOf(values);
    }
}
