package com.yeogidam.media.extraction.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.yeogidam.media.extraction.config.KakaoLocalProperties;
import com.yeogidam.media.extraction.domain.ExtractionFailureReason;
import com.yeogidam.media.extraction.domain.LocationHint;
import com.yeogidam.media.extraction.domain.LocationHint.Basis;
import com.yeogidam.media.extraction.domain.LocationHint.Type;
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
import org.springframework.web.client.RestClient;

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
    void 오타가_있으면_Gemini의_검색_이름_단서를_우선해_찾는다() {
        // given
        kakaoServer.respondWith("송화산시도삭면 건대", documents(
                document("200", "송화산시도삭면", "서울 광진구 자양동 1", "서울 광진구 뚝섬로27길 48")));
        PlaceSearchHint hint = hint("송화산시도삭멘", "송화산시도삭면", Type.REGION, "건대");

        // when
        List<Place> result = searcher().search(hint);

        // then
        assertThat(result).hasSize(1);
        assertThat(result.getFirst().externalSource().placeId()).isEqualTo("200");
        assertThat(kakaoServer.queries()).contains("송화산시도삭면 건대");
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
    void 카카오가_503을_반환하면_요청_예외가_발생한다() {
        // given
        kakaoServer.respondWithStatus(503);
        PlaceSearchHint hint = new PlaceSearchHint("올드빅", null, List.of(), List.of(), null);

        // when & then
        assertThatThrownBy(() -> searcher().search(hint))
                .isInstanceOf(ExtractionFailedException.class)
                .extracting(exception -> ((ExtractionFailedException) exception).reason())
                .isEqualTo(ExtractionFailureReason.PROCESSING_FAILED);
    }

    private KakaoPlaceSearcher searcher() {
        KakaoLocalProperties properties = new KakaoLocalProperties("test-kakao-key");
        return new KakaoPlaceSearcher(RestClient.create(), properties, kakaoServer.endpoint());
    }

    private PlaceSearchHint hint(String name, String searchName, Type type, String location) {
        return new PlaceSearchHint(name, searchName, List.of(),
                List.of(new LocationHint(type, location, Basis.CAPTION)), null);
    }

    private String documents(String... documents) {
        return "{\"documents\":[" + String.join(",", documents) + "]}";
    }

    private String document(String id, String name, String address, String roadAddress) {
        return """
                {"id":"%s","place_name":"%s","address_name":"%s","road_address_name":"%s",
                 "x":"127.0","y":"37.5","category_name":"음식점 > 중식","phone":"",
                 "place_url":"https://place.map.kakao.com/%s"}
                """.formatted(id, name, address, roadAddress, id);
    }

    private static class FakeKakaoServer {

        private final HttpServer server;
        private final Map<String, String> responses = new HashMap<>();
        private final List<String> queries = new ArrayList<>();
        private String authorization;
        private int status = 200;

        private FakeKakaoServer() throws IOException {
            server = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
            server.createContext("/v2/local/search/keyword.json", this::handle);
            server.start();
        }

        private void handle(HttpExchange exchange) throws IOException {
            String query = readQuery(exchange.getRequestURI());
            int page = readPage(exchange.getRequestURI());
            queries.add(query);
            authorization = exchange.getRequestHeaders().getFirst("Authorization");
            byte[] response = responses.getOrDefault(query + "|" + page, "{\"documents\":[]}")
                    .getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(status, response.length);
            try (OutputStream output = exchange.getResponseBody()) {
                output.write(response);
            }
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
