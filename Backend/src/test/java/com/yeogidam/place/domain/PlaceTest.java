package com.yeogidam.place.domain;

import static com.yeogidam.support.PlaceFixture.place;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

import org.junit.jupiter.api.Test;

class PlaceTest {

    @Test
    void 외부_식별자와_장소_정보로_장소를_생성한다() {
        Place place = place(1L);

        assertThat(place.externalSource().placeId()).isEqualTo("kakao-1");
        assertThat(place.profile().name()).isEqualTo(new PlaceName("경복궁"));
        assertThat(place.profile().category()).isEqualTo("관광명소");
        assertThat(place.summaryAddress()).isEqualTo("서울 종로구");
    }

    @Test
    void 카테고리와_연락처와_사진이_없어도_장소를_생성한다() {
        Place original = place(1L);
        PlaceProfile profile = original.profile();

        assertThatCode(() -> new Place(
                1L,
                original.externalSource(),
                new PlaceProfile(profile.name(), profile.address(), profile.coordinate(), null, null, null)
        )).doesNotThrowAnyException();
    }
}
