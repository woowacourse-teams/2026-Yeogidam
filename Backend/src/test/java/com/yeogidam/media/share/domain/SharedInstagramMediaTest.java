package com.yeogidam.media.share.domain;

import static com.yeogidam.support.fixture.PlaceFixture.place;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertAll;

import com.yeogidam.media.exception.MediaErrorCode;
import com.yeogidam.media.exception.MediaException;
import com.yeogidam.media.extraction.domain.ExtractedPlaces;
import com.yeogidam.media.instagram.domain.InstagramUrl;
import com.yeogidam.place.domain.Place;
import com.yeogidam.place.domain.PlaceDecisionStatus;
import java.util.List;
import org.junit.jupiter.api.Test;

class SharedInstagramMediaTest {

    private static final InstagramUrl URL = new InstagramUrl("https://www.instagram.com/reel/DcVaTEdRMyP/");

    @Test
    void 서로_다른_회원이_같은_게시물을_공유해도_장소_결정은_공유마다_독립적이다() {
        // given: 두 회원이 같은 게시물을 공유하고, 각 공유에 장소 1의 미결정 후보가 있다.
        Place extractedPlace = place(1L);
        ExtractedPlaces extracted = new ExtractedPlaces(List.of(extractedPlace));
        SharedInstagramMedia firstShare = share(1L, 1L, extracted);
        SharedInstagramMedia secondShare = share(2L, 2L, extracted);
        PlaceCandidate firstCandidate = firstShare.candidates().values().getFirst();
        PlaceCandidate secondCandidate = secondShare.candidates().values().getFirst();

        // when: 첫 회원의 공유에서만 장소 1을 SAVED로 결정한다.
        List<Long> savedPlaceIds = firstShare.decidePlaces(List.of(1L), PlaceDecisionStatus.SAVED);

        // then: 첫 공유의 후보만 결정되고, 두 번째 공유의 후보는 미결정으로 남는다.
        assertAll(
                () -> assertThat(savedPlaceIds)
                        .containsExactly(1L),
                () -> assertThat(firstCandidate.canDecide())
                        .isFalse(),
                () -> assertThat(secondCandidate.canDecide())
                        .isTrue());
    }

    @Test
    void 후보가_아닌_장소가_포함된_요청은_400_예외가_발생한다() {
        // given
        SharedInstagramMedia share = share(1L, 1L, new ExtractedPlaces(List.of(place(1L))));

        // when & then
        assertAll(
                () -> assertThatThrownBy(() -> share.decidePlaces(List.of(1L, 2L), PlaceDecisionStatus.SAVED))
                        .isInstanceOfSatisfying(MediaException.class, exception ->
                                assertThat(exception.getErrorCode()).isEqualTo(MediaErrorCode.NOT_A_CANDIDATE)),
                () -> assertThat(share.candidates().values().getFirst().canDecide()).isTrue());
    }

    @Test
    void 후보가_발급되기_전에는_장소를_결정할_수_없다() {
        // given
        SharedInstagramMedia share = new SharedInstagramMedia(1L, 10L, URL);

        // when & then
        assertThatThrownBy(() -> share.decidePlaces(List.of(1L), PlaceDecisionStatus.SAVED))
                .isInstanceOfSatisfying(MediaException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(MediaErrorCode.EXTRACTION_NOT_FINISHED));
    }

    private SharedInstagramMedia share(
            Long id,
            Long memberId,
            ExtractedPlaces extracted
    ) {
        PlaceCandidates candidates = new PlaceCandidates(extracted.values()
                .stream()
                .map(PlaceCandidate::new)
                .toList());
        return new SharedInstagramMedia(id, memberId, 10L, URL, candidates);
    }
}
