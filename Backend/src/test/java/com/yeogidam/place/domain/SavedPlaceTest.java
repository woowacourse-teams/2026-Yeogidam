package com.yeogidam.place.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertAll;

import java.time.LocalDateTime;
import org.junit.jupiter.api.Test;

class SavedPlaceTest {

    private static final LocalDateTime FIRST = LocalDateTime.of(2026, 9, 1, 12, 0);
    private static final LocalDateTime LATER = LocalDateTime.of(2026, 9, 16, 9, 30);

    @Test
    void 처음_저장하면_처음과_마지막_저장_시각이_같다() {
        // when
        SavedPlace savedPlace = new SavedPlace(1L, 10L, FIRST);

        // then
        assertAll(
                () -> assertThat(savedPlace.id()).isNull(),
                () -> assertThat(savedPlace.memberId()).isEqualTo(1L),
                () -> assertThat(savedPlace.placeId()).isEqualTo(10L),
                () -> assertThat(savedPlace.firstSavedAt()).isEqualTo(FIRST),
                () -> assertThat(savedPlace.lastSavedAt()).isEqualTo(FIRST)
        );
    }

    @Test
    void 다시_저장하면_마지막_저장_시각만_바뀌고_처음_저장_시각은_그대로다() {
        // given
        SavedPlace savedPlace = new SavedPlace(1L, 10L, FIRST);

        // when
        savedPlace.saveAgain(LATER);

        // then
        assertAll(
                () -> assertThat(savedPlace.firstSavedAt()).isEqualTo(FIRST),
                () -> assertThat(savedPlace.lastSavedAt()).isEqualTo(LATER)
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
                        .isInstanceOf(IllegalArgumentException.class),
                () -> assertThatThrownBy(() -> new SavedPlace(5L, 1L, 10L, FIRST, null))
                        .isInstanceOf(IllegalArgumentException.class)
        );
    }

    @Test
    void 다시_저장할_때_시각이_없으면_예외가_발생하고_이전_시각은_그대로다() {
        // given
        SavedPlace savedPlace = new SavedPlace(1L, 10L, FIRST);

        // when & then
        assertThatThrownBy(() -> savedPlace.saveAgain(null))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(savedPlace.lastSavedAt()).isEqualTo(FIRST);
    }
}
