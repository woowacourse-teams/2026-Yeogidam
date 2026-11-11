package com.yeogidam.place.domain;

import java.util.Locale;
import java.util.Set;

/**
 * 장소가 있는 나라의 ISO 3166-1 alpha-2 코드다.
 */
public record CountryCode(
        String value
) {

    // KOREA를 만들 때 생성자가 ISO 목록을 읽으므로, ISO 목록을 KOREA보다 먼저 초기화한다.
    private static final Set<String> ISO_COUNTRIES = Locale.getISOCountries(Locale.IsoCountryCode.PART1_ALPHA2);

    public static final CountryCode KOREA = new CountryCode("KR");

    public CountryCode {
        if (value == null || !ISO_COUNTRIES.contains(value)) {
            throw new IllegalArgumentException("ISO 국가 코드가 아닙니다: " + value);
        }
    }
}
