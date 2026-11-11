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

class GoogleOverseasPlaceSearcherTest {

    private FakeGoogleServer googleServer;

    @BeforeEach
    void setUp() throws IOException {
        googleServer = new FakeGoogleServer();
    }

    @AfterEach
    void tearDown() {
        googleServer.close();
    }

    @Test
    void 장소명에_지역을_붙여_구글에서_찾고_구글_ID와_구글_이름으로_장소를_만든다() {
        // given
        googleServer.respondWith("Ichiran Shibuya", places(
                place("ChIJ-ichiran", "이치란", "일본 도쿄도 시부야구 진난 1-22-7", "JP", "ramen_restaurant")));
        PlaceSearchHint hint = hint("Ichiran", null, region("Shibuya"), "JP");

        // when
        List<Place> result = searcher("test-google-key").search(hint);

        // then
        assertThat(result).hasSize(1);
        Place place = result.getFirst();
        assertThat(place.externalSource().placeId()).isEqualTo("ChIJ-ichiran");
        assertThat(place.externalSource().kakaoPlaceUrl()).isNull();
        assertThat(place.profile().name().value()).isEqualTo("이치란");
        assertThat(place.profile().address().landLotAddress()).isEqualTo("일본 도쿄도 시부야구 진난 1-22-7");
        assertThat(place.profile().address().countryCode()).isEqualTo(new CountryCode("JP"));
        assertThat(place.externalSource().mapProvider()).isEqualTo(MapProvider.GOOGLE);
        assertThat(place.profile().coordinate().latitude().toPlainString()).isEqualTo("35.6614");
        assertThat(place.profile().category()).isEqualTo("음식점 > 일식");
        assertThat(googleServer.queries()).containsExactly("Ichiran Shibuya");
    }

    @Test
    void 구글_요청에_키와_받을_필드와_나라를_담는다() {
        // given
        PlaceSearchHint hint = hint("Ichiran", null, region("Shibuya"), "JP");

        // when
        searcher("test-google-key").search(hint);

        // then
        assertThat(googleServer.apiKey()).isEqualTo("test-google-key");
        assertThat(googleServer.fieldMask()).contains("places.id", "places.addressComponents");
        assertThat(googleServer.fieldMask()).doesNotContain("places.googleMapsUri");
        assertThat(googleServer.lastBody().path("regionCode").asString()).isEqualTo("JP");
        assertThat(googleServer.lastBody().path("languageCode").asString()).isEqualTo("ko");
    }

    @Test
    void 단서와_나라가_다른_결과는_버린다() {
        // given
        googleServer.respondWith("Ichiran Shibuya", places(
                place("ChIJ-seoul", "이치란 서울", "서울 마포구 서교동 1", "KR", "ramen_restaurant"),
                place("ChIJ-ichiran", "이치란", "일본 도쿄도 시부야구 진난 1-22-7", "JP", "ramen_restaurant")));
        PlaceSearchHint hint = hint("Ichiran", null, region("Shibuya"), "JP");

        // when
        List<Place> result = searcher("test-google-key").search(hint);

        // then
        assertThat(result).extracting(place -> place.externalSource().placeId())
                .containsExactly("ChIJ-ichiran");
    }

    @Test
    void 지역을_붙인_검색이_비면_원문명과_보정명으로_다시_찾는다() {
        // given
        PlaceSearchHint hint = hint("이치란", "Ichiran", region("Shibuya"), "JP");

        // when
        List<Place> result = searcher("test-google-key").search(hint);

        // then
        assertThat(result).isEmpty();
        assertThat(googleServer.queries())
                .containsExactly("이치란 Shibuya", "Ichiran Shibuya", "이치란", "Ichiran");
    }

    @Test
    void 도시나_행정구역_결과는_가게가_아니라서_건너뛴다() {
        // given
        String city = place("ChIJ-dresden", "드레스덴", "드레스덴", "DE", "locality")
                .replace("\"types\":[\"locality\",\"restaurant\",\"food\"]", "\"types\":[\"locality\",\"political\"]");
        String market = place("ChIJ-striezelmarkt", "슈트리첼마르크트", "Altmarkt, 01067 Dresden", "DE", "tourist_attraction")
                .replace("\"types\":[\"tourist_attraction\",\"restaurant\",\"food\"]",
                        "\"types\":[\"tourist_attraction\",\"point_of_interest\",\"establishment\"]");
        googleServer.respondWith("Dresden", places(city, market));
        PlaceSearchHint hint = new PlaceSearchHint("Dresden", null, List.of(), List.of(), null, "DE");

        // when
        List<Place> result = searcher("test-google-key").search(hint);

        // then
        assertThat(city).contains("\"political\"");
        assertThat(result).extracting(place -> place.externalSource().placeId())
                .containsExactly("ChIJ-striezelmarkt");
    }

    @Test
    void 단서에_없는_지점이_붙은_가게는_지점_근거가_없어_넣지_않는다() {
        // given
        googleServer.respondWith("규카츠 모토무라 Shibuya", places(
                place("ChIJ-motomura-shibuya", "규카츠 모토무라 시부야점", "일본 도쿄도 시부야구", "JP", "restaurant")));
        PlaceSearchHint hint = hint("규카츠 모토무라", null, region("Shibuya"), "JP");

        // when
        List<Place> result = searcher("test-google-key").search(hint);

        // then
        assertThat(result).isEmpty();
        assertThat(googleServer.queries()).containsExactly("규카츠 모토무라 Shibuya");
    }

    @Test
    void 단서_이름에_지점명이_있으면_해당_지점을_넣는다() {
        // given
        googleServer.respondWith("규카츠 모토무라 시부야점 Shibuya", places(
                place("ChIJ-motomura-shibuya", "규카츠 모토무라 시부야점", "일본 도쿄도 시부야구", "JP", "restaurant")));
        PlaceSearchHint hint = hint("규카츠 모토무라 시부야점", null, region("Shibuya"), "JP");

        // when
        List<Place> result = searcher("test-google-key").search(hint);

        // then
        assertThat(result).extracting(place -> place.externalSource().placeId())
                .containsExactly("ChIJ-motomura-shibuya");
    }

    @Test
    void 같은_이름의_가게가_결과에_둘_이상이면_지점을_몰라_넣지_않는다() {
        // given
        googleServer.respondWith("쿠라 스시 Tokyo", places(
                place("ChIJ-kura-1", "쿠라 스시", "일본 도쿄도 도시마구", "JP", "sushi_restaurant"),
                place("ChIJ-kura-2", "쿠라 스시 신주쿠", "일본 도쿄도 신주쿠구", "JP", "sushi_restaurant")));
        PlaceSearchHint hint = hint("쿠라 스시", null, region("Tokyo"), "JP");

        // when
        List<Place> result = searcher("test-google-key").search(hint);

        // then
        assertThat(result).isEmpty();
    }

    @Test
    void 이름이_다른_가게가_함께_나오면_다지점으로_보지_않는다() {
        // given
        googleServer.respondWith("Bar Luce Milano", places(
                place("ChIJ-bar-luce", "Bar Luce", "Largo Isarco 2, Milano", "IT", "cafe"),
                place("ChIJ-prada", "Fondazione Prada", "Largo Isarco 2, Milano", "IT", "museum")));
        PlaceSearchHint hint = hint("Bar Luce", null, region("Milano"), "IT");

        // when
        List<Place> result = searcher("test-google-key").search(hint);

        // then
        assertThat(result).extracting(place -> place.externalSource().placeId()).containsExactly("ChIJ-bar-luce");
    }

    @Test
    void 주소가_있으면_지점_근거가_있어_지점이_붙은_가게도_넣는다() {
        // given
        LocationHint captionAddress = new LocationHint(Type.ADDRESS, "Imaizumi 1-7-21", Basis.CAPTION);
        googleServer.respondWith("하르모 Imaizumi 1-7-21", places(
                place("ChIJ-harmo", "카페 하르모 이마이즈미점", "일본 후쿠오카시 주오구 이마이즈미 1-7-21", "JP", "cafe")));
        PlaceSearchHint hint = hint("하르모", null, captionAddress, "JP");

        // when
        List<Place> result = searcher("test-google-key").search(hint);

        // then
        assertThat(result).extracting(place -> place.externalSource().placeId())
                .containsExactly("ChIJ-harmo");
    }

    @Test
    void 키가_없으면_구글에_요청하지_않는다() {
        // given
        PlaceSearchHint hint = hint("Ichiran", null, region("Shibuya"), "JP");

        // when
        List<Place> result = searcher(" ").search(hint);

        // then
        assertThat(result).isEmpty();
        assertThat(googleServer.queries()).isEmpty();
    }

    @Test
    void 구글_오류_응답은_게시물_전체를_실패시키지_않고_찾지_못한_것으로_둔다() {
        // given
        googleServer.respondWithStatus(403);
        PlaceSearchHint hint = hint("Ichiran", null, region("Shibuya"), "JP");

        // when
        List<Place> result = searcher("test-google-key").search(hint);

        // then
        assertThat(result).isEmpty();
        assertThat(googleServer.queries()).containsExactly("Ichiran Shibuya");
    }

    @Test
    void 캡션_주소로_못_찾으면_장소명만으로_다시_찾지_않는다() {
        // given
        LocationHint captionAddress = new LocationHint(Type.ADDRESS, "Rathausplatz, 1010 Wien", Basis.CAPTION);
        PlaceSearchHint hint = hint("Blue Bottle", null, captionAddress, "AT");

        // when
        List<Place> result = searcher("test-google-key").search(hint);

        // then
        assertThat(result).isEmpty();
        assertThat(googleServer.queries()).containsExactly("Blue Bottle Rathausplatz, 1010 Wien");
    }

    @Test
    void 나라나_좌표가_빠졌거나_ID가_너무_긴_결과는_건너뛰고_다음_결과를_쓴다() {
        // given
        String noCountry = place("ChIJ-no-country", "이치란", "도쿄", "JP", "ramen_restaurant")
                .replace("\"addressComponents\":[{\"longText\":\"JP\",\"shortText\":\"JP\",\"types\":[\"country\",\"political\"]}]",
                        "\"addressComponents\":[]");
        String noLocation = place("ChIJ-no-location", "좌표 없는 가게", "도쿄", "JP", "ramen_restaurant")
                .replace("\"location\":{\"latitude\":35.6614,\"longitude\":139.7006},", "");
        String longId = place("ChIJ-" + "x".repeat(251), "ID가 긴 가게", "도쿄", "JP", "ramen_restaurant");
        String valid = place("ChIJ-ichiran", "이치란", "일본 도쿄도 시부야구", "JP", "ramen_restaurant");
        googleServer.respondWith("Ichiran Shibuya", places(noCountry, noLocation, longId, valid));
        PlaceSearchHint hint = hint("Ichiran", null, region("Shibuya"), "JP");

        // when
        List<Place> result = searcher("test-google-key").search(hint);

        // then
        assertThat(noCountry).doesNotContain("\"country\"");
        assertThat(noLocation).doesNotContain("\"location\"");
        assertThat(result).extracting(place -> place.externalSource().placeId())
                .containsExactly("ChIJ-ichiran");
    }

    @Test
    void 구글이_빈_본문을_주면_찾지_못한_것으로_둔다() {
        // given
        googleServer.respondWith("Ichiran Shibuya", "");
        PlaceSearchHint hint = hint("Ichiran", null, region("Shibuya"), "JP");

        // when
        List<Place> result = searcher("test-google-key").search(hint);

        // then
        assertThat(result).isEmpty();
    }

    @Test
    void 단서에_주소와_지역이_함께_있으면_적힌_순서와_관계없이_주소를_붙여_찾는다() {
        // given
        LocationHint region = new LocationHint(Type.REGION, "Shibuya", Basis.CAPTION);
        LocationHint address = new LocationHint(Type.ADDRESS, "1-22-7 Jinnan", Basis.CAPTION);
        PlaceSearchHint hint = new PlaceSearchHint("Ichiran", null, List.of(), List.of(region, address), null, "JP");

        // when
        searcher("test-google-key").search(hint);

        // then
        assertThat(googleServer.queries()).containsExactly("Ichiran 1-22-7 Jinnan");
    }

    @Test
    void 장소명에_지역이_이미_있으면_지역을_다시_붙이지_않는다() {
        // given
        PlaceSearchHint hint = hint("Ichiran Shibuya", null, region("shibuya"), "JP");

        // when
        searcher("test-google-key").search(hint);

        // then
        assertThat(googleServer.queries()).containsExactly("Ichiran Shibuya");
    }

    @Test
    void 한_글자_지점명은_단서에_지점_낱말_전체가_있어야_지점_근거로_본다() {
        // given: 「이치란 본점」의 지점명 「본」은 한 글자라서, 단서의 「본관」에 「본」이 들어 있어도 근거로 보지 않는다.
        googleServer.respondWith("이치란 본관 Fukuoka", places(
                place("ChIJ-ichiran-honten", "이치란 본점", "일본 후쿠오카", "JP", "ramen_restaurant")));
        PlaceSearchHint hint = hint("이치란 본관", null, region("Fukuoka"), "JP");

        // when
        List<Place> result = searcher("test-google-key").search(hint);

        // then
        assertThat(result).isEmpty();
    }

    @Test
    void 두_글자_이상_지점명은_단서에_지점명만_있어도_지점_근거로_본다() {
        // given
        googleServer.respondWith("규카츠 모토무라 난바 Osaka", places(
                place("ChIJ-motomura-namba", "규카츠 모토무라 난바점", "일본 오사카", "JP", "japanese_restaurant")));
        PlaceSearchHint hint = hint("규카츠 모토무라 난바", null, region("Osaka"), "JP");

        // when
        List<Place> result = searcher("test-google-key").search(hint);

        // then
        assertThat(result).extracting(place -> place.externalSource().placeId())
                .containsExactly("ChIJ-motomura-namba");
    }

    private GoogleOverseasPlaceSearcher searcher(String apiKey) {
        return new GoogleOverseasPlaceSearcher(
                new GooglePlacesClient(RestClient.create(), new GooglePlacesProperties(apiKey), googleServer.endpoint()));
    }

    private PlaceSearchHint hint(String name, String searchName, LocationHint location, String countryCode) {
        return new PlaceSearchHint(name, searchName, List.of(), List.of(location), null, countryCode);
    }

    private LocationHint region(String value) {
        return new LocationHint(Type.REGION, value, Basis.CAPTION);
    }
}
