package com.yeogidam.media.extraction.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.yeogidam.media.extraction.config.GeminiProperties;
import com.yeogidam.media.extraction.domain.ExtractionFailureReason;
import com.yeogidam.media.extraction.exception.ExtractionFailedException;
import com.yeogidam.media.instagram.domain.DownloadedMedia;
import com.yeogidam.media.instagram.domain.InstagramUrl;
import com.yeogidam.media.instagram.infrastructure.InstagramMediaDownloader;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
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
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

class GeminiMediaExtractionTest {

    private final JsonMapper mapper = JsonMapper.builder().build();
    private HttpServer server;
    private URI baseUri;
    private FakeMediaDownloader downloader;
    private GeminiPlaceNameExtractor extractor;
    private final List<String> deleted = new ArrayList<>();
    private final List<byte[]> uploads = new ArrayList<>();
    private final AtomicInteger uploadCount = new AtomicInteger();
    private String uploadState = "ACTIVE";
    private int analysisStatus = 200;
    private String requestBody;
    private boolean failSecondUpload;
    private String analysisResponse = """
            {"candidates":[{"finishReason":"STOP","content":{"parts":[
            {"text":"{\\\"places\\\":[]}"}]}}]}
            """;

    @BeforeEach
    void setUp() throws Exception {
        server = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
        baseUri = URI.create("http://localhost:" + server.getAddress().getPort());
        server.createContext("/", this::handle);
        server.start();
        downloader = new FakeMediaDownloader(List.of(media("image/jpeg", "first image"), media("video/mp4", "video")));
        RestClient client = RestClient.create();
        GeminiProperties properties = new GeminiProperties("test-key", "test-model");
        GeminiFileClient fileClient = new GeminiFileClient(client, properties, baseUri, Duration.ofSeconds(3));
        extractor = new GeminiPlaceNameExtractor(client, properties, mapper, baseUri.resolve("/v1/interactions"),
                client, downloader, fileClient);
    }

    private DownloadedMedia media(String mime, String bytes) throws IOException {
        var path = Files.createTempFile("yeogidam-test-", ".bin");
        Files.writeString(path, bytes);
        return new DownloadedMedia(path, mime);
    }

    @AfterEach
    void tearDown() {
        downloader.delete(downloader.files);
        server.stop(0);
    }

    @Test
    void 모든_원본을_순서대로_업로드하고_캡션과_미디어_전용_프롬프트를_전달한_뒤_파일을_삭제한다() {
        // when
        var hints = extractor.extractFile("친구들과 나들이", new InstagramUrl("https://www.instagram.com/p/post/"));

        // then
        JsonNode request = mapper.readTree(requestBody);
        assertThat(hints.places()).isEmpty();
        assertThat(uploads).hasSize(2);
        assertThat(new String(uploads.getFirst(), StandardCharsets.UTF_8)).isEqualTo("first image");
        assertThat(new String(uploads.getLast(), StandardCharsets.UTF_8)).isEqualTo("video");
        assertThat(request.path("contents").size()).isEqualTo(1);
        assertThat(request.path("contents").path(0).path("role").asString()).isEqualTo("user");
        JsonNode contents = request.path("contents").path(0).path("parts");
        assertThat(contents.size()).isEqualTo(3);
        assertThat(contents.path(0).path("text").asString()).isEqualTo("친구들과 나들이");
        assertThat(contents.path(1).path("fileData").path("fileUri").asString()).isEqualTo(baseUri + "/files/1");
        assertThat(contents.path(1).path("fileData").path("mimeType").asString()).isEqualTo("image/jpeg");
        assertThat(contents.path(2).path("fileData").path("mimeType").asString()).isEqualTo("video/mp4");
        assertThat(request.path("generationConfig").path("responseMimeType").asString())
                .isEqualTo("application/json");
        assertThat(request.path("generationConfig").path("mediaResolution").asString())
                .isEqualTo("MEDIA_RESOLUTION_HIGH");
        assertThat(request.path("generationConfig").path("responseJsonSchema").path("properties").has("places"))
                .isTrue();
        assertThat(request.path("systemInstruction").path("parts").path(0).path("text").asString())
                .contains("제공되지 않았거나 확인할 수 없는 데이터는 분석했다고 가정하지 않는다",
                        "주소 또는 지역 정보를 확인한 출처", "메뉴명만으로 상호명이나 주소를 추측하지 않는다");
        assertThat(deleted).containsExactly("files/1", "files/2");
        assertThat(downloader.files).allSatisfy(file -> assertThat(Files.exists(file.path())).isFalse());
    }

    @Test
    void Gemini_분석_요청이_실패해도_업로드와_로컬_파일을_삭제한다() {
        // given
        analysisStatus = 503;

        // when & then
        assertThatThrownBy(() -> extractor.extractFile("나들이", new InstagramUrl("https://www.instagram.com/p/post/")))
                .isInstanceOf(ExtractionFailedException.class)
                .extracting(exception -> ((ExtractionFailedException) exception).reason())
                .isEqualTo(ExtractionFailureReason.PROCESSING_FAILED);
        assertThat(deleted).containsExactly("files/1", "files/2");
        assertThat(downloader.files).allSatisfy(file -> assertThat(Files.exists(file.path())).isFalse());
    }

    @Test
    void Gemini_응답에서_분석_결과만_모아_읽는다() {
        // given
        analysisResponse = """
                {"candidates":[{"finishReason":"STOP","content":{"parts":[
                {"thought":true,"text":"internal thought"},
                {"text":"{\\\"places\\\":"},{"text":"[]}"}]}}]}
                """;

        // when
        var hints = extractor.extractFile("나들이", new InstagramUrl("https://www.instagram.com/p/post/"));

        // then
        assertThat(hints.places()).isEmpty();
    }

    @Test
    void 토큰_한도로_중단된_응답이면_예외가_발생한다() {
        // given
        analysisResponse = """
                {"candidates":[{"finishReason":"MAX_TOKENS","content":{"parts":[
                {"text":"{\\\"places\\\":[]}"}]}}]}
                """;

        // when & then
        assertThatThrownBy(() -> extractor.extractFile("나들이", new InstagramUrl("https://www.instagram.com/p/post/")))
                .isInstanceOf(ExtractionFailedException.class)
                .extracting(exception -> ((ExtractionFailedException) exception).reason())
                .isEqualTo(ExtractionFailureReason.PROCESSING_FAILED);
        assertThat(deleted).containsExactly("files/1", "files/2");
        assertThat(downloader.files).allSatisfy(file -> assertThat(Files.exists(file.path())).isFalse());
    }

    @Test
    void 업로드_파일의_처리가_실패하면_해당_파일과_로컬_파일을_정리하고_분석하지_않는다() {
        // given
        uploadState = "FAILED";

        // when & then
        assertThatThrownBy(() -> extractor.extractFile("나들이", new InstagramUrl("https://www.instagram.com/p/post/")))
                .isInstanceOf(ExtractionFailedException.class);
        assertThat(requestBody).isNull();
        assertThat(deleted).containsExactly("files/1");
        assertThat(downloader.files).allSatisfy(file -> assertThat(Files.exists(file.path())).isFalse());
    }

    @Test
    void 두번째_파일_업로드가_실패해도_앞서_업로드한_파일까지_삭제한다() {
        // given
        failSecondUpload = true;

        // when & then
        assertThatThrownBy(() -> extractor.extractFile("나들이", new InstagramUrl("https://www.instagram.com/p/post/")))
                .isInstanceOf(ExtractionFailedException.class);
        assertThat(deleted).containsExactly("files/2", "files/1");
        assertThat(requestBody).isNull();
        assertThat(downloader.files).allSatisfy(file -> assertThat(Files.exists(file.path())).isFalse());
    }

    private void handle(HttpExchange exchange) throws IOException {
        String path = exchange.getRequestURI().getPath();
        if (path.equals("/upload/v1beta/files")) {
            int number = uploadCount.incrementAndGet();
            exchange.getResponseHeaders().set("X-Goog-Upload-URL", baseUri + "/upload/" + number);
            respond(exchange, 200, "{}");
            return;
        }
        if (path.startsWith("/upload/")) {
            uploads.add(exchange.getRequestBody().readAllBytes());
            String number = path.substring("/upload/".length());
            if (failSecondUpload && number.equals("2")) {
                respond(exchange, 200, "{\"file\":" + file(number, "FAILED") + "}");
                return;
            }
            respond(exchange, 200, "{\"file\":" + file(number, uploadState) + "}");
            return;
        }
        if (path.startsWith("/v1beta/files/")) {
            String number = path.substring("/v1beta/files/".length());
            if (exchange.getRequestMethod().equals("DELETE")) {
                deleted.add("files/" + number);
                respond(exchange, 200, "{}");
                return;
            }
            respond(exchange, 200, file(number, "ACTIVE"));
            return;
        }
        requestBody = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        JsonNode request = mapper.readTree(requestBody);
        if (!path.equals("/v1beta/models/test-model:generateContent") || !request.has("contents")
                || !request.path("contents").path(0).path("parts").path(2).has("fileData")) {
            respond(exchange, 400, """
                    {"error":{"message":"Use generateContent with fileData for video","code":"invalid_request"}}
                    """);
            return;
        }
        respond(exchange, analysisStatus, analysisResponse);
    }

    private String file(String number, String state) {
        return "{\"name\":\"files/" + number + "\",\"uri\":\"" + baseUri + "/files/" + number
                + "\",\"state\":\"" + state + "\"}";
    }

    private void respond(HttpExchange exchange, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, bytes.length);
        try (var output = exchange.getResponseBody()) {
            output.write(bytes);
        }
    }

    private static class FakeMediaDownloader extends InstagramMediaDownloader {

        private final List<DownloadedMedia> files;

        private FakeMediaDownloader(List<DownloadedMedia> files) {
            super(null, RestClient.create());
            this.files = files;
        }

        @Override
        public List<DownloadedMedia> download(InstagramUrl url) {
            return files;
        }
    }
}
