package com.yeogidam.media.share.domain;

import static com.yeogidam.support.PlaceFixture.place;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertAll;

import com.yeogidam.place.domain.PlaceDecisionStatus;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.EnumSource;

class PlaceCandidateTest {

    @Test
    void 후보는_미결정으로_태어난다() {
        assertThat(new PlaceCandidate(place(1L)).decision()).isEqualTo(PlaceDecisionStatus.UNDECIDED);
    }

    @ParameterizedTest
    @EnumSource(value = PlaceDecisionStatus.class, names = {"SAVED", "DISCARDED"})
    void 미결정_후보는_저장이나_버림으로_결정된다(PlaceDecisionStatus target) {
        // given
        PlaceCandidate candidate = new PlaceCandidate(place(1L));

        // when
        boolean decided = candidate.decide(target);

        // then
        assertAll(
                () -> assertThat(decided).isTrue(),
                () -> assertThat(candidate.decision()).isEqualTo(target)
        );
    }

    @ParameterizedTest
    @CsvSource({"SAVED, DISCARDED", "DISCARDED, SAVED", "SUPERSEDED, SAVED", "SUPERSEDED, DISCARDED"})
    void 이미_결정됐거나_닫힌_후보는_다시_결정되지_않는다(PlaceDecisionStatus current, PlaceDecisionStatus target) {
        // given
        PlaceCandidate candidate = new PlaceCandidate(place(1L), current);

        // when
        boolean decided = candidate.decide(target);

        // then
        assertAll(
                () -> assertThat(decided).isFalse(),
                () -> assertThat(candidate.decision()).isEqualTo(current)
        );
    }

    @Test
    void 장소나_결정_상태가_없으면_예외가_발생한다() {
        assertAll(
                () -> assertThatThrownBy(() -> new PlaceCandidate(null))
                        .isInstanceOf(IllegalArgumentException.class),
                () -> assertThatThrownBy(() -> new PlaceCandidate(place(1L), null))
                        .isInstanceOf(IllegalArgumentException.class)
        );
    }
}
