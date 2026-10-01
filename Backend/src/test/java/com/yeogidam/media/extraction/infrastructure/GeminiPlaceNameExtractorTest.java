package com.yeogidam.media.extraction.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.yeogidam.media.extraction.config.GeminiProperties;
import com.yeogidam.media.extraction.domain.ExtractionFailureReason;
import com.yeogidam.media.extraction.domain.PlaceSearchHints;
import com.yeogidam.media.extraction.exception.ExtractionFailedException;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

class GeminiPlaceNameExtractorTest {

    private static final String CAPTION = "📍올드빅\n분위기가 좋아요. #해방촌 @oldbig";
    private static final String EXTRACTED_PLACES = """
            {"places":[
              {"nameInCaption":"올드빅","nameSearchHint":null,"accountHints":["@oldbig"],
               "locationHints":[{"type":"REGION","value":"해방촌","basis":"CAPTION"}],"categoryHint":"술집"},
              {"nameInCaption":"Dub.+","nameSearchHint":"Dub+","accountHints":[],
               "locationHints":[{"type":"REGION","value":"이태원","basis":"INFERRED"}],"categoryHint":null}
            ]}
            """;

    private final JsonMapper jsonMapper = JsonMapper.builder().build();
    private FakeGeminiServer geminiServer;

    @BeforeEach
    void setUp() throws IOException {
        geminiServer = new FakeGeminiServer();
    }

    @AfterEach
    void tearDown() {
        geminiServer.close();
    }

    @Test
    void 캡션_전체를_고정한_JSON_스키마로_보내고_여러_장소와_검색_단서를_반환한다() throws Exception {
        // given
        geminiServer.respondWith(interactionResponse(EXTRACTED_PLACES));

        // when
        PlaceSearchHints hints = extractor("test-gemini-key").extract(CAPTION);

        // then
        assertThat(hints.places()).hasSize(2);
        assertThat(hints.places().get(0).nameInCaption()).isEqualTo("올드빅");
        assertThat(hints.places().get(0).nameSearchHint()).isNull();
        assertThat(hints.places().get(0).accountHints()).containsExactly("@oldbig");
        assertThat(hints.places().get(1).nameSearchHint()).isEqualTo("Dub+");
        assertThat(hints.places().get(1).locationHints().getFirst().value()).isEqualTo("이태원");
        assertRequestUsesFrozenSchema();
    }

    @Test
    void 장소가_없는_캡션은_빈_장소_목록으로_반환한다() throws Exception {
        // given
        geminiServer.respondWith(interactionResponse("{\"places\":[]}"));

        // when
        PlaceSearchHints hints = extractor("test-gemini-key").extract("친구들과 즐거운 하루");

        // then
        assertThat(hints.places()).isEmpty();
    }

    @Test
    void 응답에_장소_결과가_없으면_추출_예외가_발생한다() throws Exception {
        // given
        geminiServer.respondWith(interactionResponse("{\"unexpected\":[]}"));

        // when & then
        assertThatThrownBy(() -> extractor("test-gemini-key").extract(CAPTION))
                .isInstanceOf(ExtractionFailedException.class)
                .extracting(exception -> ((ExtractionFailedException) exception).reason())
                .isEqualTo(ExtractionFailureReason.PROCESSING_FAILED);
    }

    @Test
    void API_키가_비어_있으면_요청하지_않고_설정_예외가_발생한다() {
        // when & then
        assertThatThrownBy(() -> extractor("").extract(CAPTION))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Gemini API 키");
        assertThat(geminiServer.requestCount()).isZero();
    }

    private GeminiPlaceNameExtractor extractor(String apiKey) {
        GeminiProperties properties = new GeminiProperties(apiKey, "test-gemini-model");
        return new GeminiPlaceNameExtractor(RestClient.builder().build(), properties, jsonMapper,
                geminiServer.endpoint());
    }

    private String interactionResponse(String output) throws Exception {
        return """
                {"status":"completed","steps":[{"type":"model_output","content":[{"type":"text","text":%s}]}]}
                """.formatted(jsonMapper.writeValueAsString(output));
    }

    private void assertRequestUsesFrozenSchema() throws Exception {
        JsonNode request = jsonMapper.readTree(geminiServer.requestBody());
        JsonNode schema = request.path("response_format").path("schema");
        JsonNode placeProperties = schema.path("properties").path("places").path("items").path("properties");
        JsonNode locationProperties = placeProperties.path("locationHints").path("items").path("properties");

        assertThat(request.path("model").asString()).isEqualTo("test-gemini-model");
        assertThat(request.path("store").asBoolean()).isFalse();
        assertThat(request.path("input").asString())
                .isEqualTo(CAPTION + "\n\nInstagram account profile URLs:\nhttps://www.instagram.com/oldbig/");
        assertThat(request.path("tools").toString())
                .isEqualTo("[{\"type\":\"url_context\"}]");
        assertThat(request.path("system_instruction").asString())
                .contains("URL Context", "공개 Instagram 프로필 URL", "@멘션과 정확히 일치");
        assertThat(geminiServer.apiKey()).isEqualTo("test-gemini-key");
        assertThat(fieldNames(schema.path("properties"))).containsExactly("places");
        assertThat(fieldNames(placeProperties)).containsExactlyInAnyOrder(
                "nameInCaption", "nameSearchHint", "accountHints", "locationHints", "categoryHint");
        assertThat(placeProperties.get("correctedName")).isNull();
        assertThat(placeProperties.path("nameSearchHint").path("type").isArray()).isTrue();
        assertThat(fieldNames(locationProperties)).containsExactlyInAnyOrder("type", "value", "basis");
        assertThat(locationProperties.path("type").path("enum").toString())
                .isEqualTo("[\"ADDRESS\",\"REGION\"]");
        assertThat(locationProperties.path("basis").path("enum").toString())
                .isEqualTo("[\"CAPTION\",\"INFERRED\"]");
    }

    private Set<String> fieldNames(JsonNode object) {
        Set<String> names = new HashSet<>();
        object.properties().forEach(property -> names.add(property.getKey()));
        return names;
    }

    private static class FakeGeminiServer {

        private final HttpServer server;
        private final AtomicReference<String> responseBody = new AtomicReference<>();
        private final AtomicReference<String> requestBody = new AtomicReference<>();
        private final AtomicReference<String> apiKey = new AtomicReference<>();
        private final AtomicInteger requestCount = new AtomicInteger();

        private FakeGeminiServer() throws IOException {
            server = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
            server.createContext("/v1/interactions", this::handle);
            server.start();
        }

        private void handle(HttpExchange exchange) throws IOException {
            requestCount.incrementAndGet();
            requestBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            apiKey.set(exchange.getRequestHeaders().getFirst("x-goog-api-key"));
            byte[] response = responseBody.get().getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, response.length);
            try (OutputStream output = exchange.getResponseBody()) {
                output.write(response);
            }
        }

        private void respondWith(String response) {
            responseBody.set(response);
        }

        private URI endpoint() {
            return URI.create("http://localhost:" + server.getAddress().getPort() + "/v1/interactions");
        }

        private String requestBody() {
            return requestBody.get();
        }

        private String apiKey() {
            return apiKey.get();
        }

        private int requestCount() {
            return requestCount.get();
        }

        private void close() {
            server.stop(0);
        }
    }
}
