package com.yeogidam.media.extraction.infrastructure.loadtest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertAll;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import com.yeogidam.media.extraction.config.ExtractionConfig;
import com.yeogidam.media.extraction.config.LoadTestProperties;
import com.yeogidam.media.extraction.infrastructure.GeminiFileClient;
import com.yeogidam.media.instagram.domain.DownloadedMedia;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Arrays;
import java.util.Map;
import java.util.Random;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.zip.GZIPInputStream;
import java.util.zip.GZIPOutputStream;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.core.env.MapPropertySource;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.http.client.MockClientHttpRequest;
import org.springframework.mock.http.client.MockClientHttpResponse;
import org.springframework.web.client.RestClient;

class LoadTestMediaClientsTest {

    private static final String SHORTCODE = "ydlt_test_01";
    private static final String GEMINI_HOST = "https://generativelanguage.googleapis.com";
    private static final String VIDEO = "fixture-video";
    private static final String NO_PLACES = "{\"places\":[]}";

    @TempDir
    Path directory;

    @Test
    void 미디어_클라이언트는_측정_범위에서_영상과_업로드를_Fake로_보내고_인증_키는_보내지_않는다() throws IOException {
        Map<String, Request> requests = new ConcurrentHashMap<>();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> respond(exchange, requests));
        server.start();
        URI fakeBase = URI.create("http://127.0.0.1:" + server.getAddress().getPort());
        try (AnnotationConfigApplicationContext context = createContext(fakeBase)) {
            var instagram = context.getBean("instagramMediaRestClient", RestClient.class);
            var gemini = context.getBean("geminiMediaRestClient", RestClient.class);
            Path file = Files.writeString(directory.resolve("video.mp4"), VIDEO);
            try (LoadTestScope ignored = LoadTestScope.open(SHORTCODE)) {
                String video = instagram.get()
                        .uri("https://test.cdninstagram.com/video.mp4")
                        .retrieve()
                        .body(String.class);
                assertThat(video).isEqualTo(VIDEO);
                var client = new GeminiFileClient(gemini);
                var uploaded = client.upload(new DownloadedMedia(file, "video/mp4"), "real-key");
                assertThat(uploaded.name()).isEqualTo("files/fixture");
                client.delete(uploaded.name(), "real-key");
            }

            instagram.get().uri(fakeBase.resolve("/direct")).retrieve().toBodilessEntity();
            Request start = requests.get("/external/gemini/upload/v1beta/files");
            Request upload = requests.get("/external/gemini/mock-upload/fixture");
            assertThat(start.command()).isEqualTo("start");
            assertThat(start.shortcode()).isEqualTo(SHORTCODE);
            assertThat(start.apiKey()).isNull();
            assertThat(upload.command()).isEqualTo("upload, finalize");
            assertThat(upload.offset()).isEqualTo("0");
            assertThat(upload.body()).isEqualTo(VIDEO);
            assertThat(requests.get("/external/gemini/v1beta/files/fixture").apiKey()).isNull();
            assertThat(requests.get("/direct").shortcode()).isNull();
        } finally {
            server.stop(0);
        }
    }

    @Test
    void Google_Places_검색은_측정_범위에서_Fake로_보내고_인증_키는_보내지_않는다() throws IOException {
        Map<String, Request> requests = new ConcurrentHashMap<>();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> respond(exchange, requests));
        server.start();
        URI fakeBase = URI.create("http://127.0.0.1:" + server.getAddress().getPort());
        try (AnnotationConfigApplicationContext context = createContext(fakeBase)) {
            var google = context.getBean("googlePlacesRestClient", RestClient.class);
            try (LoadTestScope ignored = LoadTestScope.open(SHORTCODE)) {
                String places = google.post()
                        .uri("https://places.googleapis.com/v1/places:searchText")
                        .header("X-Goog-Api-Key", "real-key")
                        .contentType(MediaType.APPLICATION_JSON)
                        .body("{\"textQuery\":\"Ichiran Shibuya\"}")
                        .retrieve()
                        .body(String.class);
                assertThat(places).isEqualTo(NO_PLACES);
            }

            Request search = requests.get("/external/google-places/v1/places:searchText");
            assertThat(search.shortcode()).isEqualTo(SHORTCODE);
            assertThat(search.apiKey()).isNull();
            assertThat(search.body()).contains("Ichiran Shibuya");
        } finally {
            server.stop(0);
        }
    }

    private AnnotationConfigApplicationContext createContext(URI fakeBase) {
        var context = new AnnotationConfigApplicationContext();
        context.getEnvironment().getPropertySources().addFirst(new MapPropertySource("test", Map.of(
                "media.extraction.pipeline-version", "1",
                "media.extraction.executor.metadata.core-size", "1",
                "media.extraction.executor.metadata.queue-capacity", "1",
                "media.extraction.executor.analysis.core-size", "1",
                "media.extraction.executor.analysis.queue-capacity", "1",
                "media.extraction.gemini.api-key", "test",
                "media.extraction.gemini.model", "test",
                "media.extraction.kakao.api-key", "test")));
        context.register(ExtractionConfig.class);
        context.registerBean(io.micrometer.core.instrument.MeterRegistry.class, SimpleMeterRegistry::new);
        context.registerBean(RestClient.Builder.class, () -> RestClient.builder(), bean -> bean.setScope("prototype"));
        context.registerBean(LoadTestHttpRouting.class, () -> new LoadTestHttpRouting(
                new LoadTestProperties(fakeBase, "fake-key", "ydlt_test_", Set.of(1L))));
        context.registerBean(LoadTestBeanPostProcessor.class,
                () -> new LoadTestBeanPostProcessor(context.getBeanFactory()));
        context.refresh();
        return context;
    }

    private void respond(HttpExchange exchange, Map<String, Request> requests) throws IOException {
        try (exchange) {
            String path = exchange.getRequestURI().getPath();
            var headers = exchange.getRequestHeaders();
            requests.put(path, new Request(
                    headers.getFirst("X-Load-Test-Shortcode"),
                    headers.getFirst("x-goog-api-key"),
                    headers.getFirst("X-Goog-Upload-Command"),
                    headers.getFirst("X-Goog-Upload-Offset"),
                    new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8)));
            switch (path) {
                case "/external/image/video.mp4" -> reply(exchange, "video/mp4", VIDEO);
                case "/external/gemini/upload/v1beta/files" -> {
                    exchange.getResponseHeaders().set("X-Goog-Upload-URL", GEMINI_HOST + "/mock-upload/fixture");
                    reply(exchange, "application/json", "{}");
                }
                case "/external/gemini/mock-upload/fixture" -> reply(exchange, "application/json", """
                        {"file":{"name":"files/fixture","state":"ACTIVE","uri":"%s/v1beta/files/fixture"}}
                        """.formatted(GEMINI_HOST));
                case "/external/google-places/v1/places:searchText" -> reply(exchange, "application/json", NO_PLACES);
                case "/external/gemini/v1beta/files/fixture", "/direct" -> exchange.sendResponseHeaders(204, -1);
                default -> exchange.sendResponseHeaders(404, -1);
            }
        }
    }

    private void reply(HttpExchange exchange, String contentType, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", contentType);
        exchange.sendResponseHeaders(200, bytes.length);
        exchange.getResponseBody().write(bytes);
    }

    private record Request(String shortcode, String apiKey, String command, String offset, String body) {
    }


    private final SimpleMeterRegistry registry = new SimpleMeterRegistry();

    @AfterEach
    void closeRegistry() {
        registry.close();
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void gzip_본문은_압축된_길이보다_많이_읽어도_끝까지_수신하기_전에_성공을_기록하지_않는다(boolean async)
            throws Exception {
        // given
        byte[] compressed = compressedBody();
        HttpServer server = startServer(compressed, compressed.length, "gzip");
        try (var client = client(registry)) {
            var response = send(client, server, async);
            try (InputStream body = response.body()) {
                // when
                assertThat(body.readNBytes(compressed.length)).hasSize(compressed.length);

                // then
                assertThat(count(registry, "success")).isZero();

                // when
                body.readAllBytes();

                // then
                assertAll(
                        () -> assertThat(count(registry, "success")).isEqualTo(1),
                        () -> assertThat(count(registry, "error")).isZero()
                );
            }
            assertThat(count(registry, "success")).isEqualTo(1);
        } finally {
            server.stop(0);
        }
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void gzip_응답이_중간에_끊기면_성공_없이_실패를_한_번_기록한다(boolean async) throws Exception {
        // given
        byte[] compressed = compressedBody();
        HttpServer server = startServer(compressed, compressed.length / 2, "gzip");
        try (var client = client(registry)) {
            var response = send(client, server, async);
            try (InputStream body = response.body()) {
                // when
                assertThat(body.readNBytes(compressed.length)).hasSize(compressed.length);

                // then
                assertThat(count(registry, "success")).isZero();
                assertThatThrownBy(body::readAllBytes).isInstanceOf(IOException.class);
            }
            assertAll(
                    () -> assertThat(count(registry, "success")).isZero(),
                    () -> assertThat(count(registry, "error")).isEqualTo(1)
            );
        } finally {
            server.stop(0);
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "identity"})
    void 압축되지_않은_본문은_Content_Length만큼_읽으면_성공을_기록한다(String encoding) throws Exception {
        // given
        byte[] content = "thumbnail".getBytes(java.nio.charset.StandardCharsets.UTF_8);
        HttpServer server = startServer(content, content.length, encoding);
        try (var client = client(registry)) {
            var response = client.send(request(server), HttpResponse.BodyHandlers.ofInputStream());
            try (InputStream body = response.body()) {
                // when
                assertThat(body.readNBytes(content.length)).isEqualTo(content);

                // then
                assertThat(count(registry, "success")).isEqualTo(1);
            }
            assertThat(count(registry, "error")).isZero();
        } finally {
            server.stop(0);
        }
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void RestClient도_압축_본문의_수신_완료_또는_오류를_기준으로_기록한다(boolean truncated) throws IOException {
        // given
        byte[] compressed = compressedBody();
        byte[] available = compressed;
        if (truncated) {
            available = Arrays.copyOf(compressed, compressed.length / 2);
        }
        var response = new MockClientHttpResponse(
                new GZIPInputStream(new ByteArrayInputStream(available)), HttpStatus.OK);
        response.getHeaders().setContentLength(compressed.length);
        response.getHeaders().set("Content-Encoding", "gzip");
        var interceptor = new LoadTestRestClientInterceptor(routing(), new LoadTestMetrics(registry));
        var request = new MockClientHttpRequest(HttpMethod.GET, URI.create("http://localhost/image"));
        try (var measured = interceptor.intercept(request, new byte[0], (ignored, body) -> response)) {
            InputStream body = measured.getBody();

            // when
            assertThat(body.readNBytes(compressed.length)).hasSize(compressed.length);

            // then
            assertThat(count(registry, "success")).isZero();
            if (truncated) {
                assertThatThrownBy(body::readAllBytes).isInstanceOf(IOException.class);
                assertThat(count(registry, "error")).isEqualTo(1);
                return;
            }
            body.readAllBytes();
            assertThat(count(registry, "success")).isEqualTo(1);
        }
    }

    private byte[] compressedBody() throws IOException {
        byte[] noise = new byte[1024];
        new Random(1).nextBytes(noise);
        var bytes = new ByteArrayOutputStream();
        try (var gzip = new GZIPOutputStream(bytes)) {
            gzip.write(new byte[65536]);
            gzip.write(noise);
        }
        return bytes.toByteArray();
    }

    private HttpServer startServer(byte[] body, int sentLength, String encoding) throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/image", exchange -> {
            try (exchange) {
                if (!encoding.isEmpty()) {
                    exchange.getResponseHeaders().set("Content-Encoding", encoding);
                }
                exchange.sendResponseHeaders(200, body.length);
                exchange.getResponseBody().write(body, 0, sentLength);
            }
        });
        server.start();
        return server;
    }

    private LoadTestHttpClient client(SimpleMeterRegistry registry) {
        return new LoadTestHttpClient(HttpClient.newHttpClient(), routing(),
                new LoadTestMetrics(registry));
    }

    private HttpRequest request(HttpServer server) {
        return HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/image"))
                .timeout(Duration.ofSeconds(5))
                .build();
    }

    private HttpResponse<InputStream> send(LoadTestHttpClient client, HttpServer server, boolean async) throws Exception {
        HttpResponse.BodyHandler<InputStream> handler = response -> HttpResponse.BodySubscribers.mapping(
                HttpResponse.BodySubscribers.ofInputStream(), this::decompress);
        if (async) {
            return client.sendAsync(request(server), handler).get(5, TimeUnit.SECONDS);
        }
        return client.send(request(server), handler);
    }

    private InputStream decompress(InputStream stream) {
        try {
            return new GZIPInputStream(stream);
        } catch (IOException exception) {
            throw new UncheckedIOException(exception);
        }
    }

    private LoadTestHttpRouting routing() {
        return new LoadTestHttpRouting(new LoadTestProperties(
                URI.create("http://localhost"), "test", "ydlt_test_", Set.of(1L)));
    }

    private long count(SimpleMeterRegistry registry, String outcome) {
        var timer = registry.find("media.extraction.external").tag("outcome", outcome).timer();
        if (timer == null) {
            return 0;
        }
        return timer.count();
    }
}
