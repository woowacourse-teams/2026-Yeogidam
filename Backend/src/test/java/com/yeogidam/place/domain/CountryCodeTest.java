package com.yeogidam.place.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

class CountryCodeTest {

    @Test
    void ISO_국가_코드로_나라를_만든다() {
        assertThat(new CountryCode("JP").value()).isEqualTo("JP");
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"jp", "JPN", "UK", "KO"})
    void ISO_국가_코드가_아니면_예외가_발생한다(String value) {
        assertThatThrownBy(() -> new CountryCode(value))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @ParameterizedTest
    @CsvSource({"jp, JP", "' tw ', TW", "UK, GB", "uk, GB"})
    void 대소문자와_공백과_흔한_별칭을_고쳐_읽는다(String value, String expected) {
        assertThat(CountryCode.parse(value)).contains(new CountryCode(expected));
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"Japan", "KO", "XX"})
    void ISO_국가_코드로_읽을_수_없으면_빈_값이다(String value) {
        assertThat(CountryCode.parse(value)).isEmpty();
    }
}
