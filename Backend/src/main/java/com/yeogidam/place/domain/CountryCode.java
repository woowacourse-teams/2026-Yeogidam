package com.yeogidam.place.domain;

import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * 장소가 있는 나라의 ISO 3166-1 alpha-2 코드다.
 */
public record CountryCode(
        String value
) {

    // KOREA를 만들 때 생성자가 ISO 목록을 읽으므로, ISO 목록을 KOREA보다 먼저 초기화한다.
    private static final Set<String> ISO_COUNTRIES = Locale.getISOCountries(Locale.IsoCountryCode.PART1_ALPHA2);
    // ISO 코드는 아니지만 흔히 쓰는 별칭. Google 결과의 나라 코드와 맞춰야 결과가 버려지지 않는다.
    private static final Map<String, String> ALIASES = Map.of("UK", "GB");

    public static final CountryCode KOREA = new CountryCode("KR");

    public CountryCode {
        if (value == null || !ISO_COUNTRIES.contains(value)) {
            throw new IllegalArgumentException("ISO 국가 코드가 아닙니다: " + value);
        }
    }

    /**
     * 대소문자와 앞뒤 공백, 흔한 별칭을 고쳐 읽고, ISO 국가 코드가 아니면 빈 값을 돌려준다.
     */
    public static Optional<CountryCode> parse(String value) {
        if (value == null) {
            return Optional.empty();
        }
        String code = value.strip().toUpperCase(Locale.ROOT);
        code = ALIASES.getOrDefault(code, code);
        if (!ISO_COUNTRIES.contains(code)) {
            return Optional.empty();
        }
        return Optional.of(new CountryCode(code));
    }
}
