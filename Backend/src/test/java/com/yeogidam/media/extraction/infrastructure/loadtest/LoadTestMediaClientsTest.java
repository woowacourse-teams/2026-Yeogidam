package com.yeogidam.media.extraction.infrastructure.loadtest;

import static org.assertj.core.api.Assertions.assertThat;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import com.yeogidam.media.extraction.config.ExtractionConfig;
import com.yeogidam.media.extraction.config.LoadTestProperties;
import com.yeogidam.media.extraction.infrastructure.GeminiFileClient;
import com.yeogidam.media.instagram.domain.DownloadedMedia;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.core.env.MapPropertySource;
import org.springframework.http.MediaType;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
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
            var executor = context.getBean("mediaExtractionExecutor", ThreadPoolTaskExecutor.class);
            assertThat(executor.getCorePoolSize()).isEqualTo(9);
            assertThat(executor.getMaxPoolSize()).isEqualTo(10);
            assertThat(executor.getQueueCapacity()).isEqualTo(100);

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
                "media.extraction.pool.core-size", "9",
                "media.extraction.pool.max-size", "10",
                "media.extraction.pool.queue-capacity", "100",
                "media.extraction.gemini.api-key", "test",
                "media.extraction.gemini.model", "test",
                "media.extraction.kakao.api-key", "test")));
        context.register(ExtractionConfig.class);
        context.registerBean(RestClient.Builder.class, () -> RestClient.builder(), bean -> bean.setScope("prototype"));
        context.registerBean(LoadTestMetrics.class, () -> new LoadTestMetrics(new SimpleMeterRegistry()));
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
}
