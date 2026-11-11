package com.yeogidam.media.extraction.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertAll;

import com.yeogidam.media.extraction.config.KakaoLocalProperties;
import com.yeogidam.media.extraction.domain.ExtractionFailureReason;
import com.yeogidam.media.extraction.domain.ExtractionReport;
import com.yeogidam.media.extraction.domain.LocationHint.Basis;
import com.yeogidam.media.extraction.domain.LocationHint.Type;
import com.yeogidam.media.extraction.domain.LocationHint;
import com.yeogidam.media.extraction.domain.PlaceSearchHint;
import com.yeogidam.media.extraction.exception.ExtractionFailedException;
import com.yeogidam.place.domain.Place;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

class KakaoPlaceSearcherTest {

    private FakeKakaoServer kakaoServer;

    @BeforeEach
    void setUp() throws IOException {
        kakaoServer = new FakeKakaoServer();
    }

    @AfterEach
    void tearDown() {
        kakaoServer.close();
    }

    @Test
    void 주소와_장소명으로_카카오_장소를_확인한다() {
        // given
        String address = "서울 광진구 뚝섬로27길 48";
        kakaoServer.respondWith("송화산시도삭면 광진구", documents(
                document("100", "송화산시도삭면", "서울 광진구 자양동 1", address)));
        PlaceSearchHint hint = hint("송화산시도삭면", null, Type.ADDRESS, address);

        // when
        List<Place> result = searcher().search(hint);

        // then
        assertThat(result).hasSize(1);
        assertThat(result.getFirst().externalSource().placeId()).isEqualTo("100");
        assertThat(result.getFirst().profile().coordinate().latitude().toPlainString()).isEqualTo("37.5");
        assertThat(kakaoServer.queries()).containsExactly("송화산시도삭면 광진구");
        assertThat(kakaoServer.authorization()).isEqualTo("KakaoAK test-kakao-key");
    }

    @Test
    void 캡션_주소의_층과_호수를_제거해_도로명_주소로_검색한다() {
        // given
        String roadAddress = "서울 마포구 동교로 262-6";
        kakaoServer.respondWith("동일 마포구", documents(
                document("1129509773", "동일", "서울 마포구 연남동 387-13", roadAddress)));
        PlaceSearchHint hint = hint("동일", null, Type.ADDRESS,
                roadAddress + " 2층 201호");

        // when
        List<Place> result = searcher().search(hint);

        // then
        assertThat(result).hasSize(1);
        assertThat(result.getFirst().externalSource().placeId()).isEqualTo("1129509773");
        assertThat(kakaoServer.queries()).containsExactly("동일 마포구");
    }

    @Test
    void 캡션_주소에서_지역을_추출해_장소명에_붙인다() {
        // given
        String captionAddress = "서울 송파구 올림픽로 300 롯데월드몰 지하1층";
        kakaoServer.respondWith("고디바 송파구", documents(
                document("1057198980", "고디바 롯데월드몰점", "서울 송파구 신천동 29",
                        "서울 송파구 올림픽로 300"),
                document("1586587280", "고디바 파르나스몰점", "서울 강남구 삼성동 159-8",
                        "서울 강남구 테헤란로 521")));
        PlaceSearchHint hint = new PlaceSearchHint("고디바", null, List.of(), List.of(
                new LocationHint(Type.ADDRESS, captionAddress, Basis.CAPTION),
                new LocationHint(Type.REGION, "잠실", Basis.CAPTION)), null);

        // when
        List<Place> result = searcher().search(hint);

        // then
        assertThat(result).hasSize(1);
        assertThat(result.getFirst().externalSource().placeId()).isEqualTo("1057198980");
        assertThat(kakaoServer.queries()).first().isEqualTo("고디바 송파구");
    }

    @Test
    void 원문으로_찾지_못하면_보정명에_지역을_붙여_찾는다() {
        // given
        kakaoServer.respondWith("송화산시도삭면 건대", documents(
                document("200", "송화산시도삭면", "서울 광진구 자양동 1", "서울 광진구 뚝섬로27길 48")));
        PlaceSearchHint hint = hint("송화산시도삭멘", "송화산시도삭면", Type.REGION, "건대");

        // when
        List<Place> result = searcher().search(hint);

        // then
        assertAll(
                () -> assertThat(result)
                        .extracting(place -> place.externalSource().placeId())
                        .containsExactly("200"),
                () -> assertThat(kakaoServer.queries())
                        .containsExactly("송화산시도삭멘 건대", "송화산시도삭멘", "송화산시도삭면 건대"));
    }

    @Test
    void 원문과_보정명으로_모두_찾을_수_있으면_원문의_장소를_반환한다() {
        // given
        kakaoServer.respondWith("카페 목리 강진", documents(
                document("770900327", "카페목리", "전남 강진군 강진읍 목리 348", "")));
        kakaoServer.respondWith("목리 강진", documents(
                document("102607646", "강진역", "전남 강진군 강진읍 목리 265-14", "")));
        PlaceSearchHint hint = hint("카페 목리", "목리", Type.REGION, "강진");

        // when
        List<Place> result = searcher().search(hint);

        // then
        assertAll(
                () -> assertThat(result)
                        .extracting(place -> place.externalSource().placeId())
                        .containsExactly("770900327"),
                () -> assertThat(kakaoServer.queries())
                        .containsExactly("카페 목리 강진"));
    }

    @Test
    void 영문_원문으로_장소를_찾으면_잘못된_보정명으로_검색하지_않는다() {
        // given
        kakaoServer.respondWith("FRUTO FRUTA 전포", documents(
                document("1731570544", "프루토프루타", "부산 부산진구 전포동 306-2", "")));
        PlaceSearchHint hint = hint("FRUTO FRUTA", "푸르토프루타", Type.REGION, "전포");

        // when
        List<Place> result = searcher().search(hint);

        // then
        assertAll(
                () -> assertThat(result)
                        .extracting(place -> place.externalSource().placeId())
                        .containsExactly("1731570544"),
                () -> assertThat(kakaoServer.queries())
                        .containsExactly("FRUTO FRUTA 전포"));
    }

    @Test
    void 지역_검색에_실패해도_보정명보다_원문_이름만_검색을_먼저_시도한다() {
        // given
        kakaoServer.respondWith("원문상호", documents(
                document("100", "원문상호", "서울 용산구 한남동 1", "")));
        kakaoServer.respondWith("보정상호 해방촌", documents(
                document("200", "보정상호", "서울 용산구 용산동2가 1", "")));
        PlaceSearchHint hint = hint("원문상호", "보정상호", Type.REGION, "해방촌");

        // when
        List<Place> result = searcher().search(hint);

        // then
        assertAll(
                () -> assertThat(result)
                        .extracting(place -> place.externalSource().placeId())
                        .containsExactly("100"),
                () -> assertThat(kakaoServer.queries())
                        .containsExactly("원문상호 해방촌", "원문상호"));
    }

    @Test
    void 원문과_보정명으로_모두_찾지_못하면_빈_목록을_반환한다() {
        // given
        PlaceSearchHint hint = hint("원문상호", "보정상호", Type.REGION, "해방촌");

        // when
        List<Place> result = searcher().search(hint);

        // then
        assertAll(
                () -> assertThat(result)
                        .isEmpty(),
                () -> assertThat(kakaoServer.queries())
                        .containsExactly("원문상호 해방촌", "원문상호", "보정상호 해방촌", "보정상호"));
    }

    @Test
    void 원문과_보정명이_같으면_같은_검색을_반복하지_않는다() {
        // given
        PlaceSearchHint hint = hint("원문상호", "원문상호", Type.REGION, "해방촌");

        // when
        List<Place> result = searcher().search(hint);

        // then
        assertAll(
                () -> assertThat(result)
                        .isEmpty(),
                () -> assertThat(kakaoServer.queries())
                        .containsExactly("원문상호 해방촌", "원문상호"));
    }

    @Test
    void 주소가_없으면_Gemini의_지역_후보로_검색한다() {
        // given
        kakaoServer.respondWith("파이프그라운드 서울숲점", documents(
                document("2069090006", "파이프그라운드 한남",
                        "서울 용산구 한남동 1", "서울 용산구 한남대로27길 66"),
                document("660812438", "파이프그라운드 광화문",
                        "서울 종로구 세종로 1", "서울 종로구 세종대로 178"),
                document("93396236", "파이프그라운드 서울숲",
                        "서울 성동구 성수동1가 1", "서울 성동구 왕십리로 83-21")));
        PlaceSearchHint hint = new PlaceSearchHint("파이프그라운드 서울숲점", null, List.of(),
                List.of(new LocationHint(Type.REGION, "서울숲", Basis.INFERRED)), null);

        // when
        List<Place> result = searcher().search(hint);

        // then
        assertThat(result).hasSize(1);
        assertThat(result.getFirst().externalSource().placeId()).isEqualTo("2069090006");
        assertThat(kakaoServer.queries()).containsExactly("파이프그라운드 서울숲점");
    }

    @Test
    void 검색_결과의_첫_장소를_반환한다() {
        // given
        kakaoServer.respondWith("파이프그라운드 서울숲", documents(
                document("100", "파이프그라운드", "서울 용산구 한남동 1", "서울 용산구 한남대로27길 66"),
                document("2069090006", "파이프그라운드 한남",
                        "서울 용산구 한남동 1", "서울 용산구 한남대로27길 66"),
                document("660812438", "파이프그라운드 광화문",
                        "서울 종로구 세종로 1", "서울 종로구 세종대로 178"),
                document("93396236", "파이프그라운드 서울숲",
                        "서울 성동구 성수동1가 1", "서울 성동구 왕십리로 83-21")));
        PlaceSearchHint hint = hint("파이프그라운드", null, Type.REGION, "서울숲");

        // when & then
        assertThat(searcher().search(hint))
                .extracting(place -> place.externalSource().placeId())
                .containsExactly("100");
    }

    @Test
    void Gemini_검색_이름_단서에_지역을_붙여_검색한다() {
        // given
        kakaoServer.respondWith("파이프그라운드", documents(
                document("100", "파이프그라운드",
                        "서울 용산구 한남동 1", "서울 용산구 한남대로27길 66")));
        kakaoServer.respondWith("파이프그라운드 서울숲", documents(
                document("93396236", "파이프그라운드 서울숲",
                        "서울 성동구 성수동1가 1", "서울 성동구 왕십리로 83-21")));
        PlaceSearchHint hint = hint("파이프그라운드 서울숲점", "파이프그라운드",
                Type.REGION, "서울숲");

        // when & then
        assertThat(searcher().search(hint).getFirst().externalSource().placeId()).isEqualTo("93396236");
    }

    @Test
    void 같은_이름의_장소가_여러_곳이면_카카오_첫_결과를_반환한다() {
        // given
        kakaoServer.respondWith("올드빅", documents(
                document("100", "올드빅", "서울 용산구 용산동2가 1", ""),
                document("200", "올드빅", "서울 마포구 서교동 1", ""),
                document("300", "올드빅", "서울 강남구 신사동 1", ""),
                document("400", "올드빅", "서울 종로구 종로1가 1", "")));
        PlaceSearchHint hint = new PlaceSearchHint("올드빅", null, List.of(), List.of(), null);

        // when & then
        assertThat(searcher().search(hint))
                .extracting(place -> place.externalSource().placeId())
                .containsExactly("100");
    }

    @Test
    void 첫_페이지의_첫_장소만_반환한다() {
        // given
        String firstPage = "{\"meta\":{\"is_end\":false},\"documents\":["
                + document("100", "올드빅", "서울 용산구 용산동2가 1", "") + "]}";
        String secondPage = "{\"meta\":{\"is_end\":true},\"documents\":["
                + document("200", "올드빅", "서울 마포구 서교동 1", "") + "]}";
        kakaoServer.respondWithPage("올드빅", 1, firstPage);
        kakaoServer.respondWithPage("올드빅", 2, secondPage);
        PlaceSearchHint hint = new PlaceSearchHint("올드빅", null, List.of(), List.of(), null);

        // when & then
        assertThat(searcher().search(hint))
                .extracting(place -> place.externalSource().placeId())
                .containsExactly("100");
        assertThat(kakaoServer.queries()).containsExactly("올드빅");
    }

    @Test
    void 장소명과_지역으로_검색한_첫_결과를_반환한다() {
        // given
        String wrongPlace = documents(document("100", "올드빅", "서울 마포구 서교동 1", ""));
        kakaoServer.respondWith("올드빅 용산구", wrongPlace);
        PlaceSearchHint hint = hint("올드빅", null, Type.ADDRESS, "서울 용산구 녹사평대로 1");

        // when & then
        assertThat(searcher().search(hint))
                .extracting(place -> place.externalSource().placeId())
                .containsExactly("100");
    }

    @Test
    void 추론한_주소에서_지역을_추출해_검색어에_붙인다() {
        // given
        kakaoServer.respondWith("올드빅 용산구", documents(
                document("100", "올드빅", "서울 마포구 서교동 1", "서울 마포구 와우산로 1")));
        PlaceSearchHint hint = new PlaceSearchHint("올드빅", null, List.of(),
                List.of(new LocationHint(Type.ADDRESS, "서울 용산구 녹사평대로 1",
                        Basis.INFERRED)), null);

        // when & then
        assertThat(searcher().search(hint).getFirst().externalSource().placeId()).isEqualTo("100");
    }

    @Test
    void 캡션의_주소가_지역_단서보다_우선한다() {
        // given
        String address = "서울 성동구 왕십리로 83-21";
        kakaoServer.respondWith("올드빅 성동구", documents(
                document("100", "올드빅", "서울 성동구 성수동1가 1", address),
                document("200", "올드빅 서울숲", "서울 용산구 한남동 1", "서울 용산구 한남대로27길 66")));
        PlaceSearchHint hint = new PlaceSearchHint("올드빅", null, List.of(), List.of(
                new LocationHint(Type.ADDRESS, address, Basis.CAPTION),
                new LocationHint(Type.REGION, "서울숲", Basis.CAPTION)), null);

        // when & then
        assertThat(searcher().search(hint).getFirst().externalSource().placeId()).isEqualTo("100");
    }

    @Test
    void 검색_지역과_결과의_주소를_다시_비교하지_않는다() {
        // given
        kakaoServer.respondWith("파이프그라운드 서울숲", documents(
                document("2069090006", "파이프그라운드 한남",
                        "서울 용산구 한남동 1", "서울 용산구 한남대로27길 66")));
        PlaceSearchHint hint = hint("파이프그라운드", null, Type.REGION, "서울숲");

        // when & then
        assertThat(searcher().search(hint))
                .extracting(place -> place.externalSource().placeId())
                .containsExactly("2069090006");
    }

    @Test
    void 캡션_주소를_좌표로_바꿔_반경_안에서_찾는다() {
        // given
        String address = "광주 서구 금화로 278";
        kakaoServer.respondToAddress(address, "126.85", "35.14");
        kakaoServer.respondNearby("금호대패삼겹살", documents(
                document("300", "금호대패삼겹살 금호점", "광주 서구 금호동 1", address)));
        kakaoServer.respondWith("금호대패삼겹살 서구", documents(
                document("999", "이가돈", "광주 서구 치평동 1", "광주 서구 상무중앙로 1")));
        PlaceSearchHint hint = hint("금호대패삼겹살", null, Type.ADDRESS, address);

        ExtractionReport report = new ExtractionReport();

        // when
        List<Place> result = searcher().search(hint, report);

        // then
        assertThat(result).extracting(place -> place.externalSource().placeId()).containsExactly("300");
        assertThat(kakaoServer.addressQueries()).containsExactly(address);
        assertThat(kakaoServer.queries()).containsExactly("금호대패삼겹살");
        assertThat(kakaoServer.lastKeywordParameters())
                .containsEntry("x", "126.85")
                .containsEntry("y", "35.14")
                .containsEntry("radius", "3000")
                .doesNotContainKey("sort");

        JsonNode requests = new JsonMapper().valueToTree(report.toLogFields()).path("kakao_requests");
        assertThat(requests.get(0).path("stage").asString()).isEqualTo("KAKAO_ADDRESS");
        JsonNode nearby = requests.get(requests.size() - 1).path("parameters");
        assertThat(nearby.path("x").asString()).isEqualTo(kakaoServer.lastKeywordParameters().get("x"));
        assertThat(nearby.path("y").asString()).isEqualTo(kakaoServer.lastKeywordParameters().get("y"));
        assertThat(nearby.path("radius").asString()).isEqualTo("3000");
        assertThat(nearby.path("size").asString()).isEqualTo("15");
    }

    @Test
    void 주소_뒤의_층과_호수를_떼어_가며_좌표를_찾는다() {
        // given
        String roadAddress = "서울 마포구 동교로 262-6";
        kakaoServer.respondToAddress(roadAddress, "126.92", "37.56");
        kakaoServer.respondNearby("동일", documents(
                document("1129509773", "동일", "서울 마포구 연남동 387-13", roadAddress)));
        PlaceSearchHint hint = hint("동일", null, Type.ADDRESS, roadAddress + " 2층 201호");

        // when
        List<Place> result = searcher().search(hint);

        // then
        assertThat(result).extracting(place -> place.externalSource().placeId()).containsExactly("1129509773");
        assertThat(kakaoServer.addressQueries())
                .containsExactly(roadAddress + " 2층 201호", roadAddress + " 2층", roadAddress);
    }

    @Test
    void 주소를_좌표로_바꾸지_못하면_지역을_붙인_검색으로_돌아간다() {
        // given
        String address = "서울 광진구 뚝섬로27길 48";
        kakaoServer.respondWith("송화산시도삭면 광진구", documents(
                document("100", "송화산시도삭면", "서울 광진구 자양동 1", address)));
        PlaceSearchHint hint = hint("송화산시도삭면", null, Type.ADDRESS, address);

        // when
        List<Place> result = searcher().search(hint);

        // then
        assertThat(result).extracting(place -> place.externalSource().placeId()).containsExactly("100");
        assertThat(kakaoServer.addressQueries()).hasSize(4);
        assertThat(kakaoServer.queries()).containsExactly("송화산시도삭면 광진구");
    }

    @Test
    void 반경_안에_결과가_없으면_지역이나_이름만으로_다시_찾지_않고_빈_목록을_반환한다() {
        // given
        String address = "부산 남구 수영로 12";
        kakaoServer.respondToAddress(address, "129.07", "35.14");
        kakaoServer.respondWith("금빛돼지 남구", documents(
                document("90134603", "금빛돼지 초읍점", "부산 부산진구 초읍동 215-30", "부산 부산진구 초읍천로 1")));
        kakaoServer.respondWith("금빛돼지", documents(
                document("90134603", "금빛돼지 초읍점", "부산 부산진구 초읍동 215-30", "부산 부산진구 초읍천로 1")));
        PlaceSearchHint hint = hint("금빛돼지", null, Type.ADDRESS, address);

        // when & then
        assertThat(searcher().search(hint)).isEmpty();
        assertThat(kakaoServer.queries()).containsExactly("금빛돼지");
    }

    @Test
    void 캡션_주소_반경에서_원문으로_찾지_못하면_같은_반경에서_보정명으로_찾는다() {
        // given
        String address = "서울 광진구 뚝섬로27길 48";
        kakaoServer.respondToAddress(address, "127.06", "37.54");
        kakaoServer.respondNearby("송화산시도삭면", documents(
                document("200", "송화산시도삭면", "서울 광진구 자양동 1", address)));
        PlaceSearchHint hint = hint("송화산시도삭멘", "송화산시도삭면", Type.ADDRESS, address);

        // when
        List<Place> result = searcher().search(hint);

        // then
        assertAll(
                () -> assertThat(result)
                        .extracting(place -> place.externalSource().placeId())
                        .containsExactly("200"),
                () -> assertThat(kakaoServer.queries())
                        .containsExactly("송화산시도삭멘", "송화산시도삭면"),
                () -> assertThat(kakaoServer.lastKeywordParameters())
                        .containsEntry("x", "127.06")
                        .containsEntry("y", "37.54")
                        .containsEntry("radius", "3000"));
    }

    @Test
    void 캡션_주소_반경에서_원문과_보정명을_찾지_못해도_반경_밖으로_검색하지_않는다() {
        // given
        String address = "부산 남구 수영로 12";
        kakaoServer.respondToAddress(address, "129.07", "35.14");
        kakaoServer.respondWith("원문상호", documents(
                document("100", "원문상호", "서울 용산구 한남동 1", "")));
        kakaoServer.respondWith("보정상호", documents(
                document("200", "보정상호", "서울 용산구 한남동 2", "")));
        PlaceSearchHint hint = hint("원문상호", "보정상호", Type.ADDRESS, address);

        // when
        List<Place> result = searcher().search(hint);

        // then
        assertAll(
                () -> assertThat(result)
                        .isEmpty(),
                () -> assertThat(kakaoServer.queries())
                        .containsExactly("원문상호", "보정상호"),
                () -> assertThat(kakaoServer.lastKeywordParameters())
                        .containsEntry("radius", "3000"));
    }

    @Test
    void 카테고리에_관계없이_첫_번째_유효_장소를_반환한다() {
        // given
        kakaoServer.respondWith("덕수궁", documents(
                documentWithCategory("1", "덕수궁", "서울 중구 정동 5-1", "여행 > 관광,명소 > 고궁,궁"),
                documentWithCategory("2", "덕수궁 카페", "서울 중구 정동 6", "음식점 > 카페")));
        PlaceSearchHint hint = new PlaceSearchHint("덕수궁", null, List.of(), List.of(), null);

        // when & then
        assertThat(searcher().search(hint))
                .extracting(place -> place.externalSource().placeId())
                .containsExactly("1");
    }

    @Test
    void 음식점이_아닌_장소도_반환한다() {
        // given
        kakaoServer.respondWith("청계천", documents(
                documentWithCategory("1", "청계천", "서울 종로구 서린동 1", "여행 > 관광,명소 > 하천")));
        PlaceSearchHint hint = new PlaceSearchHint("청계천", null, List.of(), List.of(), null);

        // when & then
        assertThat(searcher().search(hint))
                .extracting(place -> place.externalSource().placeId())
                .containsExactly("1");
    }

    @ParameterizedTest
    @ValueSource(strings = {"INFERRED", "VIDEO", "IMAGE"})
    void 영상과_사진에서_읽거나_추론한_주소_근처에_없으면_지역을_붙인_검색으로_돌아간다(String basis) {
        // given
        kakaoServer.respondToAddress("용봉동", "126.90", "35.18");
        kakaoServer.respondWith("미드나잇익스프레스 용봉동", documents(
                document("500", "미드나잇익스프레스", "광주 남구 양림동 66-38", "광주 남구 양림로 1")));
        PlaceSearchHint hint = new PlaceSearchHint("미드나잇익스프레스", null, List.of(),
                List.of(new LocationHint(Type.ADDRESS, "용봉동", Basis.valueOf(basis))), null);

        // when & then
        assertThat(searcher().search(hint)).extracting(place -> place.externalSource().placeId()).containsExactly("500");
        assertThat(kakaoServer.queries()).containsExactly("미드나잇익스프레스", "미드나잇익스프레스 용봉동");
    }

    @ParameterizedTest
    @ValueSource(strings = {"INFERRED", "VIDEO", "IMAGE"})
    void 첨부와_추론_주소도_원문의_지역_검색까지_시도한_뒤_보정명으로_넘어간다(String basis) {
        // given
        kakaoServer.respondToAddress("용봉동", "126.90", "35.18");
        kakaoServer.respondWith("원문상호 용봉동", documents(
                document("100", "원문상호", "광주 북구 용봉동 1", "")));
        kakaoServer.respondNearby("보정상호", documents(
                document("200", "보정상호", "광주 북구 용봉동 2", "")));
        PlaceSearchHint hint = new PlaceSearchHint("원문상호", "보정상호", List.of(),
                List.of(new LocationHint(Type.ADDRESS, "용봉동", Basis.valueOf(basis))), null);

        // when
        List<Place> result = searcher().search(hint);

        // then
        assertAll(
                () -> assertThat(result)
                        .extracting(place -> place.externalSource().placeId())
                        .containsExactly("100"),
                () -> assertThat(kakaoServer.queries())
                        .containsExactly("원문상호", "원문상호 용봉동"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"INFERRED", "VIDEO", "IMAGE"})
    void 첨부와_추론_주소에서_원문_검색에_모두_실패하면_보정명으로_근처부터_다시_찾는다(String basis) {
        // given
        kakaoServer.respondToAddress("용봉동", "126.90", "35.18");
        kakaoServer.respondNearby("보정상호", documents(
                document("200", "보정상호", "광주 북구 용봉동 2", "")));
        PlaceSearchHint hint = new PlaceSearchHint("원문상호", "보정상호", List.of(),
                List.of(new LocationHint(Type.ADDRESS, "용봉동", Basis.valueOf(basis))), null);

        // when
        List<Place> result = searcher().search(hint);

        // then
        assertAll(
                () -> assertThat(result)
                        .extracting(place -> place.externalSource().placeId())
                        .containsExactly("200"),
                () -> assertThat(kakaoServer.queries())
                        .containsExactly("원문상호", "원문상호 용봉동", "원문상호", "보정상호"),
                () -> assertThat(kakaoServer.lastKeywordParameters())
                        .containsEntry("x", "126.90")
                        .containsEntry("y", "35.18")
                        .containsEntry("radius", "3000"));
    }

    @ParameterizedTest
    @ValueSource(ints = {401, 503})
    void 카카오가_401이나_503을_반환하면_HTTP_상태를_보존하고_요청_예외가_발생한다(int status) {
        // given
        kakaoServer.respondWithStatus(status);
        PlaceSearchHint hint = new PlaceSearchHint("올드빅", "보정상호", List.of(), List.of(), null);
        ExtractionReport report = new ExtractionReport();

        // when & then
        assertThatThrownBy(() -> searcher().search(hint, report))
                .isInstanceOf(ExtractionFailedException.class)
                .hasCauseInstanceOf(RestClientResponseException.class)
                .extracting(exception -> ((ExtractionFailedException) exception).reason())
                .isEqualTo(ExtractionFailureReason.PROCESSING_FAILED);
        JsonNode request = new JsonMapper().valueToTree(report.toLogFields()).path("kakao_requests").get(0);
        assertAll(
                () -> assertThat(request.path("http_status").asInt()).isEqualTo(status),
                () -> assertThat(request.path("response_count").isNull()).isTrue(),
                () -> assertThat(kakaoServer.queries())
                        .isNotEmpty()
                        .containsOnly("올드빅")
        );
    }

    @ParameterizedTest
    @ValueSource(ints = {200, 201})
    void 응답_JSON을_읽지_못해도_HTTP_상태를_보존하고_요청_예외가_발생한다(int status) {
        // given
        kakaoServer.respondWithStatus(status);
        kakaoServer.respondWith("올드빅", "{\"documents\":[broken");
        PlaceSearchHint hint = new PlaceSearchHint("올드빅", "보정상호", List.of(), List.of(), null);
        ExtractionReport report = new ExtractionReport();

        // when & then
        assertThatThrownBy(() -> searcher().search(hint, report))
                .isInstanceOf(ExtractionFailedException.class)
                .extracting(exception -> ((ExtractionFailedException) exception).reason())
                .isEqualTo(ExtractionFailureReason.PROCESSING_FAILED);
        JsonNode request = new JsonMapper().valueToTree(report.toLogFields()).path("kakao_requests").get(0);
        assertAll(
                () -> assertThat(request.path("http_status").asInt()).isEqualTo(status),
                () -> assertThat(request.path("response_count").isNull()).isTrue(),
                () -> assertThat(request.path("candidates").isEmpty()).isTrue(),
                () -> assertThat(kakaoServer.queries()).containsExactly("올드빅")
        );
    }

    @ParameterizedTest
    @ValueSource(strings = {"VIDEO", "IMAGE"})
    void 미디어에서_확인한_주소의_지역을_장소_검색에_사용한다(String basis) {
        // given
        String address = "서울 광진구 뚝섬로27길 48";
        kakaoServer.respondWith("송화산시도삭면 광진구", documents(
                document("100", "송화산시도삭면", "서울 광진구 자양동 1", address)));
        PlaceSearchHint hint = new PlaceSearchHint("송화산시도삭면", null, List.of(),
                List.of(new LocationHint(Type.ADDRESS, address, Basis.valueOf(basis))), null);

        // when
        List<Place> result = searcher().search(hint);

        // then
        assertThat(result).extracting(place -> place.externalSource().placeId()).containsExactly("100");
        assertThat(kakaoServer.queries()).containsExactly("송화산시도삭면 광진구");
    }

    @ParameterizedTest
    @ValueSource(strings = {"VIDEO", "IMAGE"})
    void 미디어에서_주소_없이_지역만_확인해도_장소_검색에_사용한다(String basis) {
        // given
        kakaoServer.respondWith("올드빅 해방촌", documents(
                document("100", "올드빅", "서울 용산구 용산동2가 1", "서울 용산구 신흥로 1")));
        PlaceSearchHint hint = new PlaceSearchHint("올드빅", null, List.of(),
                List.of(new LocationHint(Type.REGION, "해방촌", Basis.valueOf(basis))), null);

        // when
        List<Place> result = searcher().search(hint);

        // then
        assertThat(result).extracting(place -> place.externalSource().placeId()).containsExactly("100");
        assertThat(kakaoServer.queries()).containsExactly("올드빅 해방촌");
    }

    private KakaoPlaceSearcher searcher() {
        KakaoLocalProperties properties = new KakaoLocalProperties("test-kakao-key");
        return new KakaoPlaceSearcher(RestClient.create(), properties, kakaoServer.endpoint());
    }

    private PlaceSearchHint hint(
            String name,
            String searchName,
            Type type,
            String location
    ) {
        return new PlaceSearchHint(name, searchName, List.of(),
                List.of(new LocationHint(type, location, Basis.CAPTION)), null);
    }

    private String documents(String... documents) {
        return "{\"documents\":[" + String.join(",", documents) + "]}";
    }

    private String document(
            String id,
            String name,
            String address,
            String roadAddress
    ) {
        return documentWithCategory(id, name, address, "음식점 > 중식", roadAddress);
    }

    private String documentWithCategory(
            String id,
            String name,
            String address,
            String category
    ) {
        return documentWithCategory(id, name, address, category, "");
    }

    private String documentWithCategory(
            String id,
            String name,
            String address,
            String category,
            String roadAddress
    ) {
        return """
                {"id":"%s","place_name":"%s","address_name":"%s","road_address_name":"%s",
                 "x":"127.0","y":"37.5","category_name":"%s","phone":"",
                 "place_url":"https://place.map.kakao.com/%s"}
                """.formatted(id, name, address, roadAddress, category, id);
    }

    private static class FakeKakaoServer {

        private final HttpServer server;
        private final Map<String, String> responses = new HashMap<>();
        private final Map<String, String> addressResponses = new HashMap<>();
        private final Map<String, String> nearbyResponses = new HashMap<>();
        private final List<String> queries = new ArrayList<>();
        private final List<String> addressQueries = new ArrayList<>();
        private Map<String, String> lastKeywordParameters = new HashMap<>();
        private String authorization;
        private int status = 200;

        private FakeKakaoServer() throws IOException {
            server = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
            server.createContext("/v2/local/search/keyword.json", this::handle);
            server.createContext("/v2/local/search/address.json", this::handleAddress);
            server.start();
        }

        private void handle(HttpExchange exchange) throws IOException {
            String query = readQuery(exchange.getRequestURI());
            int page = readPage(exchange.getRequestURI());
            queries.add(query);
            lastKeywordParameters = readParameters(exchange.getRequestURI());
            authorization = exchange.getRequestHeaders().getFirst("Authorization");
            Map<String, String> table = lastKeywordParameters.containsKey("x") ? nearbyResponses : responses;
            respond(exchange, table.getOrDefault(query + "|" + page, "{\"documents\":[]}"));
        }

        private void handleAddress(HttpExchange exchange) throws IOException {
            String query = readQuery(exchange.getRequestURI());
            addressQueries.add(query);
            respond(exchange, addressResponses.getOrDefault(query, "{\"documents\":[]}"));
        }

        private void respond(HttpExchange exchange, String body) throws IOException {
            byte[] response = body.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(status, response.length);
            try (OutputStream output = exchange.getResponseBody()) {
                output.write(response);
            }
        }

        private Map<String, String> readParameters(URI requestUri) {
            Map<String, String> parameters = new HashMap<>();
            for (String parameter : requestUri.getRawQuery().split("&")) {
                String[] pair = parameter.split("=", 2);
                parameters.put(pair[0], URLDecoder.decode(pair.length > 1 ? pair[1] : "", StandardCharsets.UTF_8));
            }
            return parameters;
        }

        private String readQuery(URI requestUri) {
            for (String parameter : requestUri.getRawQuery().split("&")) {
                if (parameter.startsWith("query=")) {
                    return URLDecoder.decode(parameter.substring("query=".length()), StandardCharsets.UTF_8);
                }
            }
            throw new IllegalStateException("카카오 테스트 요청에 검색어가 없습니다.");
        }

        private int readPage(URI requestUri) {
            for (String parameter : requestUri.getRawQuery().split("&")) {
                if (parameter.startsWith("page=")) {
                    return Integer.parseInt(parameter.substring("page=".length()));
                }
            }
            return 1;
        }

        private void respondWith(String query, String response) {
            respondWithPage(query, 1, response);
        }

        private void respondWithPage(String query, int page, String response) {
            responses.put(query + "|" + page, response);
        }

        private void respondWithStatus(int status) {
            this.status = status;
        }

        private void respondNearby(String query, String response) {
            nearbyResponses.put(query + "|1", response);
        }

        private void respondToAddress(String address, String x, String y) {
            addressResponses.put(address,
                    "{\"documents\":[{\"address_name\":\"" + address + "\",\"x\":\"" + x + "\",\"y\":\"" + y + "\"}]}");
        }

        private List<String> addressQueries() {
            return addressQueries;
        }

        private Map<String, String> lastKeywordParameters() {
            return lastKeywordParameters;
        }

        private URI endpoint() {
            return URI.create("http://localhost:" + server.getAddress().getPort()
                    + "/v2/local/search/keyword.json");
        }

        private List<String> queries() {
            return queries;
        }

        private String authorization() {
            return authorization;
        }

        private void close() {
            server.stop(0);
        }
    }
}
