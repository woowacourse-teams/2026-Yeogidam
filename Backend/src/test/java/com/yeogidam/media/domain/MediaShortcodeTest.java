package com.yeogidam.media.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class MediaShortcodeTest {

    @Test
    void 정상_shortcode로_생성된다() {
        // given
        String value = "DcVaTEdRMyP";

        // when
        MediaShortcode mediaShortcode = new MediaShortcode(value);

        // then
        assertThat(mediaShortcode.value()).isEqualTo("DcVaTEdRMyP");
    }

    @Test
    void 밑줄과_하이픈이_포함돼도_생성된다() {
        // given
        String value = "Db-Vw4EiuV9";

        // when & then
        assertThatCode(() -> new MediaShortcode(value))
                .doesNotThrowAnyException();
    }

    @Test
    void 열_자리_shortcode도_생성된다() {
        // given
        String value = "fA9uwTtkSN";

        // when & then
        assertThatCode(() -> new MediaShortcode(value))
                .doesNotThrowAnyException();
    }

    @Test
    void null이면_예외가_발생한다() {
        // given
        String value = null;

        // when & then
        assertThatThrownBy(() -> new MediaShortcode(value))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 공백뿐이면_예외가_발생한다() {
        // given
        String value = "   ";

        // when & then
        assertThatThrownBy(() -> new MediaShortcode(value))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 허용되지_않는_문자가_있으면_예외가_발생한다() {
        // given
        String value = "한글코드";

        // when & then
        assertThatThrownBy(() -> new MediaShortcode(value))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 쿼리스트링이_섞이면_예외가_발생한다() {
        // given
        String value = "ABC?igsh=xyz";

        // when & then
        assertThatThrownBy(() -> new MediaShortcode(value))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
