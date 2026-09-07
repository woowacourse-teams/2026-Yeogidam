package com.yeogidam;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class PlaceCategoryTest {

    @Test
    void 장소_카테고리를_생성한다() {
        // given
        String value = "관광명소";

        // when
        PlaceCategory placeCategory = new PlaceCategory(value);

        // then
        assertThat(placeCategory.value()).isEqualTo(value);
    }

    @Test
    void 장소_카테고리가_null이면_예외가_발생한다() {
        // when & then
        assertThatThrownBy(() -> new PlaceCategory(null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("장소 카테고리가 비어 있습니다.");
    }

    @Test
    void 장소_카테고리가_공백뿐이면_예외가_발생한다() {
        // when & then
        assertThatThrownBy(() -> new PlaceCategory(" "))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("장소 카테고리가 비어 있습니다.");
    }
}
