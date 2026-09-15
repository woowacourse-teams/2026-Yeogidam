package com.yeogidam.place.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertAll;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

class PlaceExternalSourceTest {

    @Test
    void 외부_식별자와_링크로_출처를_만든다() {
        // when
        PlaceExternalSource source = new PlaceExternalSource("26338954", "https://place.map.kakao.com/26338954");

        // then
        assertAll(
                () -> assertThat(source.placeId()).isEqualTo("26338954"),
                () -> assertThat(source.placeUrl()).isEqualTo("https://place.map.kakao.com/26338954")
        );
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"   "})
    void 외부_식별자가_비어_있으면_예외가_발생한다(String placeId) {
        assertThatThrownBy(() -> new PlaceExternalSource(placeId, "https://place.map.kakao.com/1"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {"http://place.map.kakao.com/1", "HTTPS://place.map.kakao.com/1"})
    void http와_https_링크는_대소문자와_무관하게_담는다(String placeUrl) {
        assertThat(new PlaceExternalSource("1", placeUrl).placeUrl()).isEqualTo(placeUrl);
    }

    @ParameterizedTest
    @ValueSource(strings = {"ftp://place.map.kakao.com/1", "javascript:alert(1)", "place.map.kakao.com/1", "https://", "not a url"})
    void http_링크가_아니면_장소는_두고_링크만_null로_정규화한다(String placeUrl) {
        // when
        PlaceExternalSource source = new PlaceExternalSource("1", placeUrl);

        // then
        assertAll(
                () -> assertThat(source.placeId()).isEqualTo("1"),
                () -> assertThat(source.placeUrl()).isNull()
        );
    }

    @Test
    void 링크가_없어도_출처를_만든다() {
        assertThat(new PlaceExternalSource("1", null).placeUrl()).isNull();
    }
}
