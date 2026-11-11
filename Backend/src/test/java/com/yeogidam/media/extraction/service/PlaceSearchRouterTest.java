package com.yeogidam.media.extraction.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.yeogidam.media.extraction.domain.PlaceSearchHint;
import com.yeogidam.place.domain.Address;
import com.yeogidam.place.domain.Coordinate;
import com.yeogidam.place.domain.Place;
import com.yeogidam.place.domain.PlaceExternalSource;
import com.yeogidam.place.domain.PlaceName;
import com.yeogidam.place.domain.PlaceProfile;
import com.yeogidam.place.domain.PlaceThumbnail;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class PlaceSearchRouterTest {

    private final List<String> kakaoRequests = new ArrayList<>();
    private final List<String> overseasRequests = new ArrayList<>();

    private final PlaceSearchRouter router = new PlaceSearchRouter(
            hint -> {
                kakaoRequests.add(hint.nameInCaption());
                return List.of(place("1001"));
            },
            hint -> {
                overseasRequests.add(hint.nameInCaption());
                return List.of();
            });

    @Test
    void 한국_장소_단서는_카카오에서_찾는다() {
        // when
        List<Place> result = router.search(hint("올드빅", "KR"));

        // then
        assertThat(result).extracting(place -> place.externalSource().placeId()).containsExactly("1001");
        assertThat(kakaoRequests).containsExactly("올드빅");
        assertThat(overseasRequests).isEmpty();
    }

    @Test
    void 나라를_모르는_장소_단서는_지금처럼_카카오에서_찾는다() {
        // when
        router.search(hint("올드빅", null));

        // then
        assertThat(kakaoRequests).containsExactly("올드빅");
        assertThat(overseasRequests).isEmpty();
    }

    @Test
    void 해외_장소_단서는_해외에서_못_찾아도_카카오로_보내지_않는다() {
        // when
        List<Place> result = router.search(hint("이치란", "JP"));

        // then
        assertThat(result).isEmpty();
        assertThat(overseasRequests).containsExactly("이치란");
        assertThat(kakaoRequests).isEmpty();
    }

    @Test
    void 해외_장소_단서는_해외에서_찾은_장소를_돌려준다() {
        // given
        PlaceSearchRouter overseasRouter = new PlaceSearchRouter(
                hint -> List.of(),
                hint -> List.of(place("ChIJ-ichiran")));

        // when
        List<Place> result = overseasRouter.search(hint("이치란", "JP"));

        // then
        assertThat(result).extracting(place -> place.externalSource().placeId()).containsExactly("ChIJ-ichiran");
    }

    private PlaceSearchHint hint(String name, String countryCode) {
        return new PlaceSearchHint(name, null, List.of(), List.of(), null, countryCode);
    }

    private Place place(String placeId) {
        return new Place(null, PlaceExternalSource.kakao(placeId, null), new PlaceProfile(
                new PlaceName("올드빅"),
                new Address("서울 성동구 성수동1가 1", null),
                new Coordinate(BigDecimal.valueOf(37.5), BigDecimal.valueOf(127.0)),
                null,
                null,
                new PlaceThumbnail(null, null)));
    }
}
