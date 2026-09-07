package com.yeogidam;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class PlaceNameTest {

    @Test
    void 장소_이름을_생성한다() {
        // given
        String value = "경복궁";

        // when
        PlaceName placeName = new PlaceName(value);

        // then
        assertThat(placeName.value()).isEqualTo(value);
    }

    @Test
    void 장소_이름이_null이면_예외가_발생한다() {
        // when & then
        assertThatThrownBy(() -> new PlaceName(null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("장소 이름이 비어 있습니다.");
    }

    @Test
    void 장소_이름이_공백뿐이면_예외가_발생한다() {
        // when & then
        assertThatThrownBy(() -> new PlaceName(" "))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("장소 이름이 비어 있습니다.");
    }
}
