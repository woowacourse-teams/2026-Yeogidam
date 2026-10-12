package com.yeogidam.place.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertAll;

import java.time.Instant;
import org.junit.jupiter.api.Test;

class SavedPlaceTest {

    private static final Instant FIRST = Instant.parse("2026-09-01T12:00:00Z");

    @Test
    void 생성하면_회원과_장소와_저장_시각을_가진다() {
        // when
        SavedPlace savedPlace = new SavedPlace(1L, 10L, FIRST);

        // then
        assertAll(
                () -> assertThat(savedPlace.getMemberId()).isEqualTo(1L),
                () -> assertThat(savedPlace.getPlaceId()).isEqualTo(10L),
                () -> assertThat(savedPlace.getLastSavedAt()).isEqualTo(FIRST)
        );
    }

    @Test
    void 회원이나_장소나_저장_시각이_없으면_예외가_발생한다() {
        assertAll(
                () -> assertThatThrownBy(() -> new SavedPlace(null, 10L, FIRST))
                        .isInstanceOf(IllegalArgumentException.class),
                () -> assertThatThrownBy(() -> new SavedPlace(1L, null, FIRST))
                        .isInstanceOf(IllegalArgumentException.class),
                () -> assertThatThrownBy(() -> new SavedPlace(1L, 10L, null))
                        .isInstanceOf(IllegalArgumentException.class)
        );
    }
}
