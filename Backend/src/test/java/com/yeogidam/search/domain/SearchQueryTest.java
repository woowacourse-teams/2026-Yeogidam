package com.yeogidam.search.domain;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class SearchQueryTest {

    @Test
    void 앞뒤_공백을_제거한_검색어가_비어_있으면_예외가_발생한다() {
        // given
        String query = "   ";

        // when & then
        assertThatThrownBy(() -> new SearchQuery(query))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 앞뒤_공백을_제거한_검색어가_100자를_넘으면_예외가_발생한다() {
        // given
        String query = "  " + "가".repeat(101) + "  ";

        // when & then
        assertThatThrownBy(() -> new SearchQuery(query))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
