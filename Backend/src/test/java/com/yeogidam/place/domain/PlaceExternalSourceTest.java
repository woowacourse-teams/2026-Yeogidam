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
        PlaceExternalSource source = PlaceExternalSource.kakao("26338954", "https://place.map.kakao.com/26338954");

        // then
        assertAll(
                () -> assertThat(source.placeId()).isEqualTo("26338954"),
                () -> assertThat(source.kakaoPlaceUrl()).isEqualTo("https://place.map.kakao.com/26338954")
        );
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"   "})
    void 외부_식별자가_비어_있으면_예외가_발생한다(String placeId) {
        assertThatThrownBy(() -> PlaceExternalSource.kakao(placeId, "https://place.map.kakao.com/1"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {"http://place.map.kakao.com/1", "HTTPS://place.map.kakao.com/1"})
    void http와_https_링크는_대소문자와_무관하게_담는다(String placeUrl) {
        assertThat(PlaceExternalSource.kakao("1", placeUrl).kakaoPlaceUrl()).isEqualTo(placeUrl);
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "ftp://place.map.kakao.com/1", "javascript:alert(1)", "place.map.kakao.com/1", "https://", "not a url"
    })
    void http_링크가_아니면_장소는_두고_링크만_null로_정규화한다(String placeUrl) {
        // when
        PlaceExternalSource source = PlaceExternalSource.kakao("1", placeUrl);

        // then
        assertAll(
                () -> assertThat(source.placeId()).isEqualTo("1"),
                () -> assertThat(source.kakaoPlaceUrl()).isNull()
        );
    }

    @Test
    void 링크가_없어도_출처를_만든다() {
        assertThat(PlaceExternalSource.kakao("1", null).kakaoPlaceUrl()).isNull();
    }

    @Test
    void 지도_제공자가_없으면_예외가_발생한다() {
        assertThatThrownBy(() -> new PlaceExternalSource(null, "1", null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 카카오_장소는_저장한_카카오맵_링크로_연다() {
        // given
        PlaceExternalSource source = PlaceExternalSource.kakao("26338954", "https://place.map.kakao.com/26338954");

        // when & then
        assertAll(
                () -> assertThat(source.mapProvider()).isEqualTo(MapProvider.KAKAO),
                () -> assertThat(source.mapUrl("카페 온월")).isEqualTo("https://place.map.kakao.com/26338954")
        );
    }

    @Test
    void 구글_장소는_링크를_저장하지_않고_place_ID로_구글맵_링크를_만든다() {
        // given
        PlaceExternalSource source = PlaceExternalSource.google("ChIJxwgCUhPnAGARoz8_83liVEk");

        // when & then
        assertAll(
                () -> assertThat(source.placeId()).isEqualTo("ChIJxwgCUhPnAGARoz8_83liVEk"),
                () -> assertThat(source.kakaoPlaceUrl()).isNull(),
                () -> assertThat(source.mapProvider()).isEqualTo(MapProvider.GOOGLE),
                () -> assertThat(source.mapUrl("토미타 규카츠")).isEqualTo(
                        "https://www.google.com/maps/search/?api=1&query=%ED%86%A0%EB%AF%B8%ED%83%80+"
                                + "%EA%B7%9C%EC%B9%B4%EC%B8%A0&query_place_id=ChIJxwgCUhPnAGARoz8_83liVEk")
        );
    }
}
