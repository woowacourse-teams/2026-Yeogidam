package com.yeogidam.media.extraction.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class PlaceSearchHintsTest {

    @Test
    void 장소가_없으면_빈_목록으로_표현한다() {
        // when
        PlaceSearchHints hints = new PlaceSearchHints(List.of());

        // then
        assertThat(hints.places()).isEmpty();
    }

    @Test
    void 응답_목록을_복사해_생성_후_외부_변경을_막는다() {
        // given
        List<PlaceSearchHint> places = new ArrayList<>();
        places.add(new PlaceSearchHint("올드빅", null, List.of(), List.of(), null, null));

        // when
        PlaceSearchHints hints = new PlaceSearchHints(places);
        places.clear();

        // then
        assertThat(hints.places()).hasSize(1);
        assertThatThrownBy(() -> hints.places().clear()).isInstanceOf(UnsupportedOperationException.class);
    }

    @Test
    void 캡션에서_장소명을_찾지_못하면_빈_장소명은_허용하지_않는다() {
        // when & then
        assertThatThrownBy(() -> new PlaceSearchHint(" ", null, List.of(), List.of(), null, null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 캡션에_주소가_없어도_추론한_주소를_검색_단서로_표현한다() {
        // when
        LocationHint hint = new LocationHint(LocationHint.Type.ADDRESS, "서울 광진구 뚝섬로27길 48",
                LocationHint.Basis.INFERRED);

        // then
        assertThat(hint.basis()).isEqualTo(LocationHint.Basis.INFERRED);
    }

    @Test
    void 나라_코드는_대문자로_맞추고_코드가_아니면_모르는_나라로_둔다() {
        // when
        PlaceSearchHint lowerCase = new PlaceSearchHint("이치란", null, List.of(), List.of(), null, " jp ");
        PlaceSearchHint countryName = new PlaceSearchHint("이치란", null, List.of(), List.of(), null, "Japan");

        // then
        assertThat(lowerCase.countryCode()).isEqualTo("JP");
        assertThat(countryName.countryCode()).isNull();
    }

    @Test
    void 영국_별칭은_ISO_코드로_바꾸고_ISO_목록에_없는_두_글자는_모르는_나라로_둔다() {
        // when
        PlaceSearchHint unitedKingdom = new PlaceSearchHint("Dishoom", null, List.of(), List.of(), null, "UK");
        PlaceSearchHint languageCode = new PlaceSearchHint("올드빅", null, List.of(), List.of(), null, "KO");

        // then
        assertThat(unitedKingdom.countryCode()).isEqualTo("GB");
        assertThat(languageCode.countryCode()).isNull();
        assertThat(languageCode.isDomestic()).isTrue();
    }

    @Test
    void 나라를_모르거나_한국이면_국내_장소로_본다() {
        // when
        PlaceSearchHint unknown = new PlaceSearchHint("올드빅", null, List.of(), List.of(), null, null);
        PlaceSearchHint korea = new PlaceSearchHint("올드빅", null, List.of(), List.of(), null, "KR");
        PlaceSearchHint japan = new PlaceSearchHint("이치란", null, List.of(), List.of(), null, "JP");

        // then
        assertThat(unknown.isDomestic()).isTrue();
        assertThat(korea.isDomestic()).isTrue();
        assertThat(japan.isDomestic()).isFalse();
    }
}
