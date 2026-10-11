package com.yeogidam.media.extraction.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertAll;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import com.yeogidam.media.extraction.config.GeminiProperties;
import com.yeogidam.media.extraction.exception.ExtractionFailedException;
import com.yeogidam.media.instagram.domain.DownloadedMedia;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

class GeminiFileClientTest {

    private final GeminiProperties properties = new GeminiProperties("test-key", "test-model");
    private final List<String> deleted = new ArrayList<>();
    private final AtomicInteger polls = new AtomicInteger();
    private HttpServer server;
    private URI baseUri;
    private DownloadedMedia media;
    private GeminiFileClient client;
    private String uploadState = "ACTIVE";
    private String uploadedBody;

    @BeforeEach
    void setUp() throws IOException {
        server = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
        baseUri = URI.create("http://localhost:" + server.getAddress().getPort());
        server.createContext("/", this::handle);
        server.start();
        var path = Files.createTempFile("yeogidam-file-test-", ".bin");
        Files.writeString(path, "video content");
        media = new DownloadedMedia(path, "video/mp4");
        client = new GeminiFileClient(RestClient.create(), properties, baseUri, Duration.ofSeconds(3));
    }

    @AfterEach
    void tearDown() throws IOException {
        server.stop(0);
        Files.deleteIfExists(media.path());
    }

    @Test
    void 파일_본문을_업로드하고_분석용_참조를_반환한_뒤_삭제한다() {
        // when
        GeminiUploadedFile uploaded = client.upload(media);
        client.delete(uploaded.name());

        // then
        assertAll(
                () -> assertThat(uploadedBody).isEqualTo("video content"),
                () -> assertThat(uploaded.name()).isEqualTo("files/1"),
                () -> assertThat(uploaded.uri()).isEqualTo(baseUri + "/files/1"),
                () -> assertThat(uploaded.mimeType()).isEqualTo("video/mp4"),
                () -> assertThat(deleted).containsExactly("files/1"),
                () -> assertThat(polls.get()).isZero()
        );
    }

    @Test
    void 파일_처리가_ACTIVE가_될_때까지_확인한_뒤_참조를_반환한다() {
        // given
        uploadState = "PROCESSING";

        // when
        GeminiUploadedFile uploaded = client.upload(media);

        // then
        assertAll(
                () -> assertThat(polls.get()).isEqualTo(1),
                () -> assertThat(uploaded.name()).isEqualTo("files/1")
        );
    }

    @Test
    void 파일_처리_대기_시간이_초과되면_업로드_파일을_삭제하고_예외가_발생한다() {
        // given
        uploadState = "PROCESSING";
        GeminiFileClient immediateTimeout = new GeminiFileClient(RestClient.create(), properties, baseUri, Duration.ZERO);

        // when & then
        assertThatThrownBy(() -> immediateTimeout.upload(media)).isInstanceOf(ExtractionFailedException.class);
        assertAll(
                () -> assertThat(deleted).containsExactly("files/1"),
                () -> assertThat(polls.get()).isZero()
        );
    }

    private void handle(HttpExchange exchange) throws IOException {
        String path = exchange.getRequestURI().getPath();
        if (path.equals("/upload/v1beta/files")) {
            exchange.getResponseHeaders().set("X-Goog-Upload-URL", baseUri + "/upload/1");
            respond(exchange, "{}");
            return;
        }
        if (path.equals("/upload/1")) {
            uploadedBody = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            respond(exchange, "{\"file\":" + file(uploadState) + "}");
            return;
        }
        if (exchange.getRequestMethod().equals("DELETE")) {
            deleted.add("files/1");
            respond(exchange, "{}");
            return;
        }
        polls.incrementAndGet();
        respond(exchange, file("ACTIVE"));
    }

    private String file(String state) {
        return "{\"name\":\"files/1\",\"uri\":\"" + baseUri + "/files/1\",\"state\":\"" + state + "\"}";
    }

    private void respond(HttpExchange exchange, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.sendResponseHeaders(200, bytes.length);
        try (var output = exchange.getResponseBody()) {
            output.write(bytes);
        }
    }
}
