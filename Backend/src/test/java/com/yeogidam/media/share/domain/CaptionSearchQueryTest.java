package com.yeogidam.media.share.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

class CaptionSearchQueryTest {

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"   ", "\t\r\n"})
    void 검색어가_null이거나_앞뒤_공백을_제거한_값이_비어_있으면_예외가_발생한다(String query) {
        // when & then
        assertThatThrownBy(() -> new CaptionSearchQuery(query))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 앞뒤_공백을_제거한_검색어가_100자를_넘으면_예외가_발생한다() {
        // given
        String query = "  " + "가".repeat(101) + "  ";

        // when & then
        assertThatThrownBy(() -> new CaptionSearchQuery(query))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 앞뒤_공백을_제거한_검색어가_정확히_100자이면_허용한다() {
        // given
        String word = "가".repeat(100);

        // when
        CaptionSearchQuery query = new CaptionSearchQuery("  " + word + "  ");

        // then
        assertThat(query.getWords())
                .containsExactly(word);
    }
}
