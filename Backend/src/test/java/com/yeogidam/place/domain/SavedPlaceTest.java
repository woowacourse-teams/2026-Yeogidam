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
    void 처음_저장하면_식별자가_비어_있고_저장_시각이_들어간다() {
        // when
        SavedPlace savedPlace = new SavedPlace(1L, 10L, FIRST);

        // then
        assertAll(
                () -> assertThat(savedPlace.id()).isNull(),
                () -> assertThat(savedPlace.memberId()).isEqualTo(1L),
                () -> assertThat(savedPlace.placeId()).isEqualTo(10L),
                () -> assertThat(savedPlace.lastSavedAt()).isEqualTo(FIRST)
        );
    }

    @Test
    void 저장된_행을_읽으면_식별자를_함께_가진다() {
        // when
        SavedPlace savedPlace = new SavedPlace(5L, 1L, 10L, FIRST);

        // then
        assertAll(
                () -> assertThat(savedPlace.id()).isEqualTo(5L),
                () -> assertThat(savedPlace.lastSavedAt()).isEqualTo(FIRST)
        );
    }

    @Test
    void 다시_저장하면_마지막_저장_시각이_바뀐다() {
        // given
        SavedPlace savedPlace = new SavedPlace(1L, 10L, FIRST);

        // when
        savedPlace.saveAgain(LATER);

        // then
        assertThat(savedPlace.lastSavedAt()).isEqualTo(LATER);
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
                () -> assertThatThrownBy(() -> new SavedPlace(5L, 1L, 10L, null))
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
