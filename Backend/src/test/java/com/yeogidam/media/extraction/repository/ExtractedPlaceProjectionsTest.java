package com.yeogidam.media.extraction.repository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.yeogidam.place.exception.PlaceErrorCode;
import com.yeogidam.place.exception.PlaceException;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * "이 게시물에서 추출된 장소만 고를 수 있다" 규칙은 순수 규칙이라 DB 없이 검증한다.
 */
class ExtractedPlaceProjectionsTest {

    private final ExtractedPlaceProjections places = new ExtractedPlaceProjections(List.of(
            new ExtractedPlaceProjection(101L, "26338954"),
            new ExtractedPlaceProjection(102L, "1234567890"),
            new ExtractedPlaceProjection(103L, "987654321")
    ));

    @Test
    void 요청한_카카오_장소_id를_요청_순서대로_장소_id로_바꾼다() {
        // when
        List<Long> placeIds = places.getPlaceIds(List.of("987654321", "26338954"));

        // then
        assertThat(placeIds).containsExactly(103L, 101L);
    }

    @Test
    void 같은_id는_한_번만_센다() {
        // when
        List<Long> placeIds = places.getPlaceIds(List.of("26338954", "1234567890", "26338954"));

        // then
        assertThat(placeIds).containsExactly(101L, 102L);
    }

    @Test
    void 아무것도_고르지_않으면_빈_목록이다() {
        assertThat(places.getPlaceIds(List.of())).isEmpty();
    }

    @Test
    void 이_게시물에서_추출되지_않은_장소가_섞이면_예외가_발생한다() {
        // when & then
        assertThatThrownBy(() -> places.getPlaceIds(List.of("26338954", "000000")))
                .isInstanceOfSatisfying(PlaceException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(PlaceErrorCode.NOT_ONBOARDING_PLACE));
    }
}
