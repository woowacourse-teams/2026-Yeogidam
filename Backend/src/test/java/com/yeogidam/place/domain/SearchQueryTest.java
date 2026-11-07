package com.yeogidam.place.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.yeogidam.place.exception.PlaceErrorCode;
import com.yeogidam.place.exception.PlaceException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

class SearchQueryTest {

    @Test
    void 앞뒤_공백을_제거한_검색어가_100자이면_허용한다() {
        // given
        String word = "가".repeat(100);

        // when
        SearchQuery query = new SearchQuery("  " + word + "  ");

        // then
        assertThat(query.getWords())
                .containsExactly(word);
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = "   ")
    void 검색어가_없거나_공백뿐이면_예외가_발생한다(String query) {
        // when & then
        assertThatThrownBy(() -> new SearchQuery(query))
                .isInstanceOf(PlaceException.class)
                .extracting("errorCode")
                .isEqualTo(PlaceErrorCode.INVALID_SEARCH_QUERY);
    }

    @Test
    void 앞뒤_공백을_제거한_검색어가_100자를_넘으면_예외가_발생한다() {
        // given
        String query = "  " + "가".repeat(101) + "  ";

        // when & then
        assertThatThrownBy(() -> new SearchQuery(query))
                .isInstanceOf(PlaceException.class)
                .extracting("errorCode")
                .isEqualTo(PlaceErrorCode.INVALID_SEARCH_QUERY);
    }
}
