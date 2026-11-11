package com.yeogidam.media.extraction.repository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertAll;

import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * 장소를 게시물별로 묶는 규칙은 순수 규칙이라 DB 없이 검증한다.
 */
class SavedMediaPlaceProjectionsTest {

    @Test
    void 장소를_게시물별로_묶고_읽은_순서를_지킨다() {
        // given
        SavedMediaPlaceProjections places = new SavedMediaPlaceProjections(List.of(
                place(1L, 20L),
                place(2L, 30L),
                place(1L, 10L)
        ));

        // when & then
        assertAll(
                () -> assertThat(places.placesOf(1L))
                        .extracting(SavedMediaPlaceProjection::placeId)
                        .containsExactly(20L, 10L),
                () -> assertThat(places.placesOf(2L))
                        .extracting(SavedMediaPlaceProjection::placeId)
                        .containsExactly(30L)
        );
    }

    @Test
    void 장소가_없는_게시물은_빈_목록이다() {
        // when & then
        assertThat(new SavedMediaPlaceProjections(List.of()).placesOf(1L)).isEmpty();
    }

    /**
     * 묶는 규칙은 게시물 ID와 장소 ID만 보므로 나머지 값은 비워 둔다.
     */
    private SavedMediaPlaceProjection place(Long mediaId, Long placeId) {
        return new SavedMediaPlaceProjection(mediaId, placeId, null, null, null, null, null, null,
                null, null, null, null, null, null, null);
    }
}
