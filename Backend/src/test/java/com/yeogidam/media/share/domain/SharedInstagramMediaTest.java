package com.yeogidam.media.share.domain;

import static com.yeogidam.support.PlaceFixture.place;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.yeogidam.media.exception.MediaErrorCode;
import com.yeogidam.media.exception.MediaException;
import com.yeogidam.media.extraction.domain.ExtractedPlaces;
import com.yeogidam.media.instagram.domain.InstagramUrl;
import com.yeogidam.place.domain.PlaceDecisionStatus;
import java.util.List;
import org.junit.jupiter.api.Test;

class SharedInstagramMediaTest {

    private static final InstagramUrl URL = new InstagramUrl("https://www.instagram.com/reel/DcVaTEdRMyP/");

    @Test
    void 같은_게시물을_공유해도_장소_결정은_공유마다_독립적이다() {
        ExtractedPlaces extracted = new ExtractedPlaces(List.of(place(1L)));
        SharedInstagramMedia first = share(1L, extracted);
        SharedInstagramMedia second = share(2L, extracted);

        assertThat(first.decidePlaces(List.of(1L), PlaceDecisionStatus.SAVED)).containsExactly(1L);

        assertThat(first.candidates().values().getFirst().decision()).isEqualTo(PlaceDecisionStatus.SAVED);
        assertThat(second.candidates().values().getFirst().decision()).isEqualTo(PlaceDecisionStatus.UNDECIDED);
        assertThat(extracted.values()).containsExactly(placeFrom(first));
        assertThat(first.decidePlaces(List.of(1L), PlaceDecisionStatus.DISCARDED)).isEmpty();
        assertThat(first.candidates().values().getFirst().decision()).isEqualTo(PlaceDecisionStatus.SAVED);
    }

    @Test
    void 다른_공유의_장소가_섞인_요청은_아무_후보도_변경하지_않는다() {
        SharedInstagramMedia share = share(1L, new ExtractedPlaces(List.of(place(1L))));

        assertThatThrownBy(() -> share.decidePlaces(List.of(1L, 2L), PlaceDecisionStatus.SAVED))
                .isInstanceOfSatisfying(MediaException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(MediaErrorCode.NOT_A_CANDIDATE));
        assertThat(share.candidates().values().getFirst().decision()).isEqualTo(PlaceDecisionStatus.UNDECIDED);
    }

    @Test
    void 후보가_발급되기_전에는_장소를_결정할_수_없다() {
        SharedInstagramMedia share = new SharedInstagramMedia(1L, URL);

        assertThatThrownBy(() -> share.decidePlaces(List.of(1L), PlaceDecisionStatus.SAVED))
                .isInstanceOfSatisfying(MediaException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(MediaErrorCode.EXTRACTION_NOT_FINISHED));
    }

    private SharedInstagramMedia share(Long id, ExtractedPlaces extracted) {
        PlaceCandidates candidates = new PlaceCandidates(extracted.values().stream().map(PlaceCandidate::new).toList());
        return new SharedInstagramMedia(id, 1L, 10L, URL, candidates);
    }

    private com.yeogidam.place.domain.Place placeFrom(SharedInstagramMedia share) {
        return share.candidates().values().getFirst().place();
    }
}
