package com.yeogidam.media.share.domain;

import static com.yeogidam.support.fixture.PlaceFixture.place;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertAll;

import com.yeogidam.media.exception.MediaErrorCode;
import com.yeogidam.media.exception.MediaException;
import com.yeogidam.place.domain.PlaceDecisionStatus;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.NullSource;

class PlaceCandidateTest {

    @Test
    void 후보는_미결정으로_태어나_결정할_수_있다() {
        // when
        PlaceCandidate candidate = new PlaceCandidate(place(1L));

        // then
        assertThat(candidate.canDecide()).isTrue();
    }

    @ParameterizedTest
    @EnumSource(value = PlaceDecisionStatus.class, names = {"SAVED", "DISCARDED"})
    void 미결정_후보는_저장이나_버림으로_결정되고_그_뒤로는_결정할_수_없다(PlaceDecisionStatus target) {
        // given
        PlaceCandidate candidate = new PlaceCandidate(place(1L));

        // when
        candidate.decide(target);

        // then
        assertThat(candidate.canDecide()).isFalse();
    }

    @ParameterizedTest
    @EnumSource(value = PlaceDecisionStatus.class, names = {"SAVED", "DISCARDED", "SUPERSEDED"})
    void 이미_결정됐거나_닫힌_후보를_다시_결정하면_예외가_발생하고_상태는_그대로다(PlaceDecisionStatus current) {
        // given
        PlaceCandidate candidate = new PlaceCandidate(place(1L), current);

        // when & then
        assertAll(
                () -> assertThatThrownBy(() -> candidate.decide(PlaceDecisionStatus.SAVED))
                        .isInstanceOfSatisfying(MediaException.class, exception ->
                                assertThat(exception.getErrorCode())
                                        .isEqualTo(MediaErrorCode.PLACE_CANDIDATE_ALREADY_DECIDED)),
                () -> assertThat(candidate.canDecide()).isFalse()
        );
    }

    @ParameterizedTest
    @NullSource
    @EnumSource(value = PlaceDecisionStatus.class, names = {"UNDECIDED", "SUPERSEDED"})
    void 저장이나_버림이_아닌_값으로는_결정할_수_없다(PlaceDecisionStatus target) {
        // given
        PlaceCandidate candidate = new PlaceCandidate(place(1L));

        // when & then
        assertAll(
                () -> assertThatThrownBy(() -> candidate.decide(target))
                        .isInstanceOfSatisfying(MediaException.class, exception ->
                                assertThat(exception.getErrorCode()).isEqualTo(MediaErrorCode.INVALID_PLACE_DECISION)),
                () -> assertThat(candidate.canDecide()).isTrue()
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
