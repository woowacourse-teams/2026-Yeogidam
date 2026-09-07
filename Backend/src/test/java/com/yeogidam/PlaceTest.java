package com.yeogidam;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;

class PlaceTest {

    @Test
    void 문자열로_장소를_생성한다() {
        // given
        String name = "경복궁";
        String category = "관광명소";

        // when
        Place place = new Place(name, category);

        // then
        Assertions.assertAll(
                () -> assertThat(place.getName()).isEqualTo(new PlaceName(name)),
                () -> assertThat(place.getCategory()).isEqualTo(new PlaceCategory(category))
        );
    }
}
