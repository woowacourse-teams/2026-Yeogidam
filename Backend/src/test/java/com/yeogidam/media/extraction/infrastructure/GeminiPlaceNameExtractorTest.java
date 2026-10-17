package com.yeogidam.media.extraction.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertAll;

import com.yeogidam.media.extraction.config.GeminiProperties;
import com.yeogidam.media.extraction.domain.ExtractionFailureReason;
import com.yeogidam.media.extraction.domain.PlaceSearchHints;
import com.yeogidam.media.extraction.exception.ExtractionFailedException;
import com.yeogidam.support.fixture.MutableClock;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

class GeminiPlaceNameExtractorTest {

    private static final String FREE_KEY = "free-gemini-key";
    private static final String PAID_KEY = "paid-gemini-key";
    private static final String RATE_LIMITED = """
            {"error":{"message":"Rate limit exceeded (limit: 500 requests per day on Free Tier)","code":"too_many_requests"}}
            """;
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
    private final MutableClock clock = new MutableClock(Instant.parse("2026-10-13T00:00:00Z"));
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

    @ParameterizedTest
    @CsvSource({
            "FRUTO FRUTA, 프루토프루타",
            "프르토푸루타, 프루토프루타",
            "용욘선생, 용용선생"
    })
    void 원문_표기와_모델이_교정한_검색명을_서로_덮어쓰지_않고_반환한다(String originalName, String searchName) throws Exception {
        // given
        String output = """
                {"places":[{"nameInCaption":"%s","nameSearchHint":"%s","accountHints":[],
                  "locationHints":[{"type":"REGION","value":"전포","basis":"CAPTION"}],"categoryHint":null}]}
                """.formatted(originalName, searchName);
        geminiServer.respondWith(interactionResponse(output));

        // when
        PlaceSearchHints hints = extractor("test-gemini-key").extract(originalName + " 전포에 다녀왔어요");

        // then
        assertAll(
                () -> assertThat(hints.places().getFirst().nameInCaption()).isEqualTo(originalName),
                () -> assertThat(hints.places().getFirst().nameSearchHint()).isEqualTo(searchName),
                () -> assertThat(hints.places().getFirst().locationHints().getFirst().value()).isEqualTo("전포")
        );
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

    @ParameterizedTest
    @ValueSource(strings = {"VIDEO", "IMAGE"})
    void 미디어에서_확인한_주소의_출처를_위치_단서에_유지한다(String basis) throws Exception {
        // given
        String output = """
                {"places":[{"nameInCaption":"올드빅","nameSearchHint":null,"accountHints":[],
                  "locationHints":[{"type":"ADDRESS","value":"서울 용산구 용산동2가 1","basis":"%s"}],
                  "categoryHint":"술집"}]}
                """.formatted(basis);
        geminiServer.respondWith(interactionResponse(output));

        // when
        PlaceSearchHints hints = extractor("test-gemini-key").extract(CAPTION);

        // then
        assertThat(hints.places().getFirst().nameInCaption()).isEqualTo("올드빅");
        assertThat(hints.places().getFirst().locationHints().getFirst().basis().name()).isEqualTo(basis);
        assertThat(hints.places().getFirst().locationHints().getFirst().value())
                .isEqualTo("서울 용산구 용산동2가 1");
    }

    @Test
    void 캡션_요청은_미디어_통합_프롬프트가_아닌_기존_캡션_전용_프롬프트를_사용한다() throws Exception {
        // given
        geminiServer.respondWith(interactionResponse("{\"places\":[]}"));

        // when
        extractor("test-gemini-key").extract(CAPTION);

        // then
        JsonNode request = jsonMapper.readTree(geminiServer.requestBody());
        assertThat(request.path("system_instruction").asString())
                .startsWith("너는 인스타그램 캡션에서 지도 검색에 쓸 장소 단서를 추출한다.")
                .doesNotContain("캐러셀", "## 1. 분석 대상");
        assertRequestUsesFrozenSchema();
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

    @Test
    void 무료_key가_한도에_걸리면_결제_key로_다시_요청한다() throws Exception {
        // given
        geminiServer.respondWith(interactionResponse(EXTRACTED_PLACES));
        geminiServer.respondToKeyWith(FREE_KEY, 429, RATE_LIMITED, Map.of("Retry-After", "120"));

        // when
        PlaceSearchHints hints = extractor(FREE_KEY, PAID_KEY).extract(CAPTION);

        // then
        assertAll(
                () -> assertThat(hints.places()).hasSize(2),
                () -> assertThat(geminiServer.requestedKeys()).containsExactly(FREE_KEY, PAID_KEY)
        );
    }

    @Test
    void 한도에_걸린_key는_Retry_After_동안_건너뛰고_지나면_다시_쓴다() throws Exception {
        // given
        geminiServer.respondWith(interactionResponse(EXTRACTED_PLACES));
        geminiServer.respondToKeyWith(FREE_KEY, 429, RATE_LIMITED, Map.of("Retry-After", "120"));
        GeminiPlaceNameExtractor extractor = extractor(FREE_KEY, PAID_KEY);
        extractor.extract(CAPTION);

        // when
        clock.advance(Duration.ofSeconds(119));
        extractor.extract(CAPTION);
        geminiServer.clearKeyResponse(FREE_KEY);
        clock.advance(Duration.ofSeconds(1));
        extractor.extract(CAPTION);

        // then
        assertThat(geminiServer.requestedKeys()).containsExactly(FREE_KEY, PAID_KEY, PAID_KEY, FREE_KEY);
    }

    @ParameterizedTest
    @ValueSource(ints = {401, 402, 403})
    void 결제_잔액이_떨어지거나_key가_거절되면_해당_key를_10분_동안_건너뛴다(int status) throws Exception {
        // given
        geminiServer.respondWith(interactionResponse(EXTRACTED_PLACES));
        geminiServer.respondToKeyWith(FREE_KEY, status, "{}", Map.of());
        GeminiPlaceNameExtractor extractor = extractor(FREE_KEY, PAID_KEY);
        extractor.extract(CAPTION);

        // when
        clock.advance(Duration.ofMinutes(9));
        extractor.extract(CAPTION);

        // then
        assertThat(geminiServer.requestedKeys()).containsExactly(FREE_KEY, PAID_KEY, PAID_KEY);
    }

    @Test
    void 선불_잔액_소진_문구가_담긴_429는_Retry_After와_상관없이_해당_key를_10분_동안_건너뛴다() throws Exception {
        // given
        geminiServer.respondWith(interactionResponse(EXTRACTED_PLACES));
        geminiServer.respondToKeyWith(FREE_KEY, 429, "{\"error\":{\"message\":\"Your prepayment credits are depleted.\"}}",
                Map.of("Retry-After", "1"));
        GeminiPlaceNameExtractor extractor = extractor(FREE_KEY, PAID_KEY);
        extractor.extract(CAPTION);

        // when
        clock.advance(Duration.ofMinutes(9));
        extractor.extract(CAPTION);

        // then
        assertThat(geminiServer.requestedKeys()).containsExactly(FREE_KEY, PAID_KEY, PAID_KEY);
    }

    @Test
    void 서버_오류가_나면_다음_key로_넘기되_해당_key를_막아_두지_않는다() throws Exception {
        // given
        geminiServer.respondWith(interactionResponse(EXTRACTED_PLACES));
        geminiServer.respondToKeyWith(FREE_KEY, 503, "{}", Map.of());
        GeminiPlaceNameExtractor extractor = extractor(FREE_KEY, PAID_KEY);
        extractor.extract(CAPTION);

        // when
        geminiServer.clearKeyResponse(FREE_KEY);
        extractor.extract(CAPTION);

        // then
        assertThat(geminiServer.requestedKeys()).containsExactly(FREE_KEY, PAID_KEY, FREE_KEY);
    }

    @Test
    void 잘못된_요청이면_다른_key로_다시_보내지_않고_추출_예외가_발생한다() throws Exception {
        // given
        geminiServer.respondWith(interactionResponse(EXTRACTED_PLACES));
        geminiServer.respondToKeyWith(FREE_KEY, 400, "{}", Map.of());

        // when & then
        assertThatThrownBy(() -> extractor(FREE_KEY, PAID_KEY).extract(CAPTION))
                .isInstanceOf(ExtractionFailedException.class)
                .extracting(exception -> ((ExtractionFailedException) exception).reason())
                .isEqualTo(ExtractionFailureReason.PROCESSING_FAILED);
        assertThat(geminiServer.requestedKeys()).containsExactly(FREE_KEY);
    }

    @Test
    void 모든_key가_막혀_있으면_요청하지_않고_추출_예외가_발생한다() throws Exception {
        // given
        geminiServer.respondToKeyWith(FREE_KEY, 429, RATE_LIMITED, Map.of("Retry-After", "120"));
        geminiServer.respondToKeyWith(PAID_KEY, 429, RATE_LIMITED, Map.of("Retry-After", "120"));
        GeminiPlaceNameExtractor extractor = extractor(FREE_KEY, PAID_KEY);
        assertThatThrownBy(() -> extractor.extract(CAPTION)).isInstanceOf(ExtractionFailedException.class);

        // when & then
        assertThatThrownBy(() -> extractor.extract(CAPTION)).isInstanceOf(ExtractionFailedException.class);
        assertThat(geminiServer.requestedKeys()).containsExactly(FREE_KEY, PAID_KEY);
    }

    private GeminiPlaceNameExtractor extractor(String apiKey) {
        return extractor(apiKey, List.of());
    }

    private GeminiPlaceNameExtractor extractor(String apiKey, String fallbackApiKey) {
        return extractor(apiKey, List.of(fallbackApiKey));
    }

    private GeminiPlaceNameExtractor extractor(String apiKey, List<String> fallbackApiKeys) {
        GeminiProperties properties = new GeminiProperties(apiKey, "test-gemini-model", fallbackApiKeys);
        // 운영의 geminiRestClient처럼 JDK HttpClient를 쓴다. 기본 RestClient가 고르는 Apache HttpClient는
        // 429와 503을 받으면 Retry-After만큼 기다렸다가 스스로 한 번 더 보내서 key 전환을 가린다.
        RestClient restClient = RestClient.builder()
                .requestFactory(new JdkClientHttpRequestFactory())
                .build();
        return new GeminiPlaceNameExtractor(restClient, properties, jsonMapper, geminiServer.endpoint(), clock);
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
                .isEqualTo("[\"CAPTION\",\"INFERRED\",\"VIDEO\",\"IMAGE\"]");
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
        private final Map<String, KeyResponse> keyResponses = new ConcurrentHashMap<>();
        private final List<String> requestedKeys = new CopyOnWriteArrayList<>();

        private FakeGeminiServer() throws IOException {
            server = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
            server.createContext("/v1/interactions", this::handle);
            server.start();
        }

        private void handle(HttpExchange exchange) throws IOException {
            requestCount.incrementAndGet();
            requestBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            String requestKey = exchange.getRequestHeaders().getFirst("x-goog-api-key");
            apiKey.set(requestKey);
            requestedKeys.add(requestKey);
            KeyResponse keyResponse = keyResponses.getOrDefault(requestKey, new KeyResponse(200, responseBody.get(), Map.of()));
            byte[] response = keyResponse.body().getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            keyResponse.headers().forEach((name, value) -> exchange.getResponseHeaders().set(name, value));
            exchange.sendResponseHeaders(keyResponse.status(), response.length);
            try (OutputStream output = exchange.getResponseBody()) {
                output.write(response);
            }
        }

        private void respondWith(String response) {
            responseBody.set(response);
        }

        // 특정 key로 온 요청에만 정한 상태와 본문으로 답한다. 나머지 key는 respondWith의 정상 응답을 받는다.
        private void respondToKeyWith(String key, int status, String body, Map<String, String> headers) {
            keyResponses.put(key, new KeyResponse(status, body, headers));
        }

        private void clearKeyResponse(String key) {
            keyResponses.remove(key);
        }

        private List<String> requestedKeys() {
            return List.copyOf(requestedKeys);
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

    private record KeyResponse(
            int status,
            String body,
            Map<String, String> headers
    ) {
    }
}
