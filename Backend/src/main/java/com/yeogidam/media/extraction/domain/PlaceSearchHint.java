package com.yeogidam.media.extraction.domain;

import com.yeogidam.place.domain.CountryCode;
import java.util.List;

/**
 * 캡션에서 언급한 한 장소와 검색에 도움이 되는 단서.
 * countryCode는 장소가 있는 나라의 ISO 3166-1 alpha-2 코드다. 모르면 null이고, null과 KR은 국내 장소로 보고 카카오에서 찾는다.
 */
public record PlaceSearchHint(
        String nameInCaption,
        String nameSearchHint,
        List<String> accountHints,
        List<LocationHint> locationHints,
        String categoryHint,
        String countryCode
) {
    public PlaceSearchHint {
        validateName(nameInCaption, "캡션 장소명");
        validateOptional(nameSearchHint, "검색 이름 단서");
        validateOptional(categoryHint, "업종 단서");
        accountHints = copyRequired(accountHints, "계정 단서");
        locationHints = copyRequired(locationHints, "위치 단서");
        countryCode = normalizeCountryCode(countryCode);
    }

    public boolean isDomestic() {
        return countryCode == null || CountryCode.KOREA.value().equals(countryCode);
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

    // Gemini가 "Japan"이나 "KO"처럼 ISO 국가 코드가 아닌 값을 주면 나라를 모르는 것으로 둬서 지금처럼 카카오에서 찾는다.
    private static String normalizeCountryCode(String value) {
        return CountryCode.parse(value)
                .map(CountryCode::value)
                .orElse(null);
    }
}
