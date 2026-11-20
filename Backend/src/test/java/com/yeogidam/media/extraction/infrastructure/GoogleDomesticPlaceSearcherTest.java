package com.yeogidam.media.extraction.infrastructure;

import static com.yeogidam.media.extraction.infrastructure.FakeGoogleServer.place;
import static com.yeogidam.media.extraction.infrastructure.FakeGoogleServer.places;
import static org.assertj.core.api.Assertions.assertThat;

import com.yeogidam.media.extraction.config.GooglePlacesProperties;
import com.yeogidam.media.extraction.domain.LocationHint;
import com.yeogidam.media.extraction.domain.LocationHint.Basis;
import com.yeogidam.media.extraction.domain.LocationHint.Type;
import com.yeogidam.media.extraction.domain.PlaceSearchHint;
import com.yeogidam.place.domain.CountryCode;
import com.yeogidam.place.domain.MapProvider;
import com.yeogidam.place.domain.Place;
import java.io.IOException;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

class GoogleDomesticPlaceSearcherTest {

    private FakeGoogleServer googleServer;
    private GoogleDomesticPlaceSearcher searcher;

    @BeforeEach
    void setUp() throws IOException {
        googleServer = new FakeGoogleServer();
        searcher = new GoogleDomesticPlaceSearcher(new GooglePlacesClient(
                RestClient.create(), new GooglePlacesProperties("test-google-key"), googleServer.endpoint()));
    }

    @AfterEach
    void tearDown() {
        googleServer.close();
    }

    @Test
    void 나라를_모르는_국내_단서도_Google에서_한국_안으로_찾아_Google_장소로_만든다() {
        // given
        googleServer.respondWith("누들스트릿 서면", places(
                place("ChIJ-noodle", "누들 스트릿", "부산광역시 부산진구 동천로108번길 11", "KR", "restaurant")));

        // when
        List<Place> result = searcher.search(hint("누들스트릿", null, "서면"));

        // then
        assertThat(result).hasSize(1);
        Place place = result.getFirst();
        assertThat(place.externalSource().mapProvider()).isEqualTo(MapProvider.GOOGLE);
        assertThat(place.externalSource().placeId()).isEqualTo("ChIJ-noodle");
        assertThat(place.profile().address().countryCode()).isEqualTo(CountryCode.KOREA);
        assertThat(googleServer.lastBody().path("regionCode").asString()).isEqualTo("KR");
    }

    @Test
    void Google이_고른_가게_이름이_단서_이름과_다르면_넣지_않는다() {
        // given
        googleServer.respondWith("앵치커피 광주", places(
                place("ChIJ-chichi", "치치하하", "광주광역시 동구 경양로 350", "KR", "cafe")));

        // when
        List<Place> result = searcher.search(hint("앵치커피", "KR", "광주"));

        // then
        assertThat(result).isEmpty();
    }

    @Test
    void Google_이름이_단서_이름을_품으면_넣는다() {
        // given
        googleServer.respondWith("와쿠와쿠 동성로", places(
                place("ChIJ-wakuwaku", "와쿠와쿠 동성로점", "대구광역시 중구 동성로6길 43", "KR", "restaurant")));

        // when
        List<Place> result = searcher.search(hint("와쿠와쿠", "KR", "동성로"));

        // then
        assertThat(result).extracting(place -> place.externalSource().placeId()).containsExactly("ChIJ-wakuwaku");
    }

    @Test
    void Google_이름이_문장_부호뿐이면_넣지_않는다() {
        // given
        googleServer.respondWith("덴토 대구", places(
                place("ChIJ-symbol", "★", "대구광역시 중구 봉산문화2길 42-5", "KR", "cafe")));

        // when
        List<Place> result = searcher.search(hint("덴토", "KR", "대구"));

        // then
        assertThat(result).isEmpty();
    }

    @Test
    void 단서_이름이_문장_부호뿐이면_넣지_않는다() {
        // given
        googleServer.respondWith("!!! 수원", places(
                place("ChIJ-cafe-kii", "카페 키", "경기도 수원시 팔달구 화서문로31번길 22", "KR", "cafe")));

        // when
        List<Place> result = searcher.search(hint("!!!", "KR", "수원"));

        // then
        assertThat(result).isEmpty();
    }

    @Test
    void 보정한_이름이_Google_이름과_같으면_넣는다() {
        // given
        googleServer.respondWith("오내찜 평택", places(
                place("ChIJ-onaejjim", "오내찜", "경기도 평택시 고덕동 2506-3", "KR", "restaurant")));

        // when
        List<Place> result = searcher.search(new PlaceSearchHint(
                "Onaejjim", "오내찜", List.of(), List.of(region("평택")), null, "KR"));

        // then
        assertThat(result).extracting(place -> place.externalSource().placeId()).containsExactly("ChIJ-onaejjim");
    }

    @Test
    void Google_이름의_첫_쉼표_뒤_영문_이름은_견주지_않는다() {
        // given
        googleServer.respondWith("더클라임 연남점 클라이밍", places(
                place("ChIJ-climb", "더클라임 연남점, THECLIMB Yeonnam, Seoul", "서울특별시 마포구 양화로 186", "KR", "gym")));

        // when
        List<Place> result = searcher.search(hint("더클라임 연남점 클라이밍", "KR", "연남"));

        // then
        assertThat(result).extracting(place -> place.externalSource().placeId()).containsExactly("ChIJ-climb");
    }

    @Test
    void 국내에서는_같은_이름의_결과가_둘_이상이어도_버리지_않는다() {
        // given
        googleServer.respondWith("덕수궁 서울", places(
                place("ChIJ-deoksugung", "덕수궁", "서울특별시 중구 세종대로 99", "KR", "tourist_attraction"),
                place("ChIJ-deoksugung-wall", "덕수궁 돌담길", "서울특별시 중구 정동", "KR", "tourist_attraction")));

        // when
        List<Place> result = searcher.search(hint("덕수궁", "KR", "서울"));

        // then
        assertThat(result).extracting(place -> place.externalSource().placeId()).containsExactly("ChIJ-deoksugung");
    }

    @Test
    void 한국이_아닌_결과는_버린다() {
        // given
        googleServer.respondWith("하숙집 부산", places(
                place("ChIJ-japan", "하숙집", "일본 후쿠오카", "JP", "restaurant")));

        // when
        List<Place> result = searcher.search(hint("하숙집", "KR", "부산"));

        // then
        assertThat(result).isEmpty();
    }

    private PlaceSearchHint hint(String name, String countryCode, String region) {
        return new PlaceSearchHint(name, null, List.of(), List.of(region(region)), null, countryCode);
    }

    private LocationHint region(String value) {
        return new LocationHint(Type.REGION, value, Basis.CAPTION);
    }
}
