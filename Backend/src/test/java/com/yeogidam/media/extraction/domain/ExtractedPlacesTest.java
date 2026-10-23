package com.yeogidam.media.extraction.domain;

import static com.yeogidam.support.fixture.PlaceFixture.place;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertAll;

import com.yeogidam.place.domain.Place;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;

class ExtractedPlacesTest {

    @Test
    void 추출된_장소를_원문_순서대로_담고_개수를_센다() {
        // given
        List<Place> places = new ArrayList<>(List.of(place(1L), place(2L)));

        // when
        ExtractedPlaces extractedPlaces = new ExtractedPlaces(places);
        places.add(place(3L));

        // then
        assertAll(
                () -> assertThat(extractedPlaces.count()).isEqualTo(2),
                () -> assertThat(extractedPlaces.values()).extracting(Place::id).containsExactly(1L, 2L)
        );
    }

    @ParameterizedTest
    @NullAndEmptySource
    void 장소가_하나도_없으면_예외가_발생한다(List<Place> places) {
        assertThatThrownBy(() -> new ExtractedPlaces(places))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
