package com.yeogidam.place.repository;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;

class SavedPlaceCategoryProjectionsTest {

    @Test
    void 원문이_달라도_같은_화면_카테고리로_분류되는_장소를_함께_반환한다() {
        // given
        SavedPlaceCategoryProjections categories = new SavedPlaceCategoryProjections(List.of(
                new SavedPlaceCategoryProjection(11L, "음식점 > 간식 > 제과,베이커리"),
                new SavedPlaceCategoryProjection(12L, "음식점 > 간식 > 떡,한과"),
                new SavedPlaceCategoryProjection(13L, "음식점 > 카페 > 디저트카페")
        ));

        // when & then
        assertThat(categories.savedPlaceIdsMatching("디저트"))
                .containsExactly(11L, 12L);
    }
}
