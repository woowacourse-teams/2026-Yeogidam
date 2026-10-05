package com.yeogidam.media.share.domain;

import static com.yeogidam.support.fixture.PlaceFixture.place;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertAll;

import com.yeogidam.media.exception.MediaErrorCode;
import com.yeogidam.media.exception.MediaException;
import com.yeogidam.place.domain.PlaceDecisionStatus;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.NullSource;

/**
 * 후보 밖 장소가 섞인 요청은 SharedInstagramMediaTest가 공유 건을 통해 검증하므로 여기서는 반복하지 않는다.
 */
class PlaceCandidatesTest {

    @Test
    void 고른_장소만_결정하고_전이된_식별자를_돌려준다() {
        // given
        PlaceCandidates candidates = new PlaceCandidates(List.of(
                new PlaceCandidate(place(1L)), new PlaceCandidate(place(2L)), new PlaceCandidate(place(3L))));

        // when
        List<Long> decided = candidates.decide(List.of(1L, 3L), PlaceDecisionStatus.SAVED);

        // then
        assertAll(
                () -> assertThat(decided).containsExactly(1L, 3L),
                () -> assertThat(canDecide(candidates, 1L)).isFalse(),
                () -> assertThat(canDecide(candidates, 2L)).isTrue(),
                () -> assertThat(canDecide(candidates, 3L)).isFalse()
        );
    }

    @Test
    void 이미_결정된_후보는_건너뛰고_새로_전이된_식별자만_돌려준다() {
        // given
        PlaceCandidates candidates = new PlaceCandidates(List.of(
                new PlaceCandidate(place(1L), PlaceDecisionStatus.SAVED), new PlaceCandidate(place(2L))));

        // when
        List<Long> decided = candidates.decide(List.of(1L, 2L), PlaceDecisionStatus.SAVED);

        // then
        assertThat(decided).containsExactly(2L);
    }

    @Test
    void 버린_장소는_다시_저장할_수_없다() {
        // given
        PlaceCandidates candidates = new PlaceCandidates(List.of(
                new PlaceCandidate(place(1L), PlaceDecisionStatus.DISCARDED)));

        // when
        List<Long> decided = candidates.decide(List.of(1L), PlaceDecisionStatus.SAVED);

        // then
        assertAll(
                () -> assertThat(decided).isEmpty(),
                () -> assertThat(canDecide(candidates, 1L)).isFalse()
        );
    }

    @ParameterizedTest
    @NullAndEmptySource
    void 고른_장소가_없으면_예외가_발생한다(List<Long> placeIds) {
        // given
        PlaceCandidates candidates = new PlaceCandidates(List.of(new PlaceCandidate(place(1L))));

        // when & then
        assertThatThrownBy(() -> candidates.decide(placeIds, PlaceDecisionStatus.SAVED))
                .isInstanceOfSatisfying(MediaException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(MediaErrorCode.EMPTY_PLACE_SELECTION));
    }

    @ParameterizedTest
    @NullSource
    @EnumSource(value = PlaceDecisionStatus.class, names = {"UNDECIDED", "SUPERSEDED"})
    void 저장이나_버림이_아닌_값이면_후보의_예외가_그대로_올라오고_아무_후보도_바뀌지_않는다(PlaceDecisionStatus target) {
        // given
        PlaceCandidates candidates = new PlaceCandidates(List.of(
                new PlaceCandidate(place(1L)), new PlaceCandidate(place(2L), PlaceDecisionStatus.SAVED)));

        // when & then
        assertAll(
                () -> assertThatThrownBy(() -> candidates.decide(List.of(1L, 2L), target))
                        .isInstanceOfSatisfying(MediaException.class, exception ->
                                assertThat(exception.getErrorCode()).isEqualTo(MediaErrorCode.INVALID_PLACE_DECISION)),
                () -> assertThat(canDecide(candidates, 1L)).isTrue(),
                () -> assertThat(canDecide(candidates, 2L)).isFalse()
        );
    }

    @ParameterizedTest
    @NullAndEmptySource
    void 후보가_하나도_없으면_예외가_발생한다(List<PlaceCandidate> places) {
        assertThatThrownBy(() -> new PlaceCandidates(places))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private static boolean canDecide(PlaceCandidates candidates, Long placeId) {
        return candidates.values()
                .stream()
                .filter(candidate -> candidate.getId().equals(placeId))
                .findFirst()
                .orElseThrow()
                .canDecide();
    }
}
