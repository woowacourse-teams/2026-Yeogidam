package com.yeogidam.media.instagram.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.yeogidam.media.extraction.exception.ExtractionFailedException;
import com.yeogidam.media.instagram.domain.InstagramMediaSource;
import com.yeogidam.media.instagram.domain.InstagramUrl;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

class InstagramMediaDownloaderTest {

    private HttpServer server;
    private RestClient client;
    private final List<String> requests = new ArrayList<>();
    private int videoStatus = 200;
    private String imageMime = "image/jpeg";

    @BeforeEach
    void setUp() throws IOException {
        server = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
        server.createContext("/", exchange -> {
            String path = exchange.getRequestURI().getPath();
            requests.add(path);
            byte[] bytes = path.getBytes(StandardCharsets.UTF_8);
            String mime = imageMime;
            int status = 200;
            if (path.endsWith(".mp4")) {
                mime = "video/mp4";
                status = videoStatus;
            }
            exchange.getResponseHeaders().set("Content-Type", mime);
            exchange.sendResponseHeaders(status, bytes.length);
            try (var output = exchange.getResponseBody()) {
                output.write(bytes);
            }
        });
        server.start();
        URI base = URI.create("http://localhost:" + server.getAddress().getPort());
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory();
        client = RestClient.builder().requestFactory((uri, method) -> factory.createRequest(base.resolve(uri.getPath()), method))
                .build();
    }

    @AfterEach
    void tearDown() {
        server.stop(0);
    }

    @Test
    void 전체_캐러셀_원본을_순서대로_다운로드하고_사용_후_삭제한다() throws Exception {
        // given
        InstagramMediaDownloader downloader = downloader(List.of(source("/first.jpg", "image"),
                source("/second.mp4", "video"), source("/third.jpg", "image")));

        // when
        var files = downloader.download(new InstagramUrl("https://www.instagram.com/p/post/"));

        // then
        try {
            assertThat(requests).containsExactly("/first.jpg", "/second.mp4", "/third.jpg");
            assertThat(files).extracting(file -> Files.readString(file.path()))
                    .containsExactly("/first.jpg", "/second.mp4", "/third.jpg");
            assertThat(files).extracting(file -> file.mimeType()).containsExactly("image/jpeg", "video/mp4", "image/jpeg");
        } finally {
            downloader.delete(files);
        }
        assertThat(files).allSatisfy(file -> assertThat(Files.exists(file.path())).isFalse());
    }

    @Test
    void 다운로드_중_실패하면_이미_내려받은_파일도_모두_삭제한다() throws Exception {
        // given
        videoStatus = 503;
        Set<Path> before = temporaryMediaFiles();
        InstagramMediaDownloader downloader = downloader(List.of(source("/first.jpg", "image"), source("/second.mp4", "video")));

        // when & then
        assertThatThrownBy(() -> downloader.download(new InstagramUrl("https://www.instagram.com/p/post/")))
                .isInstanceOf(ExtractionFailedException.class);
        assertThat(temporaryMediaFiles()).isEqualTo(before);
    }

    @Test
    void 릴스_원본이_영상이_아니면_썸네일을_다운로드하지_않는다() {
        // given
        InstagramMediaDownloader downloader = downloader(List.of(source("/thumbnail.jpg", "image")));

        // when & then
        assertThatThrownBy(() -> downloader.download(new InstagramUrl("https://www.instagram.com/reel/post/")))
                .isInstanceOf(ExtractionFailedException.class);
        assertThat(requests).isEmpty();
    }

    @Test
    void CDN이_아닌_URL은_다운로드하지_않는다() {
        // given
        InstagramMediaDownloader downloader = downloader(List.of(new InstagramMediaSource(
                URI.create("http://127.0.0.1/private"), "video")));

        // when & then
        assertThatThrownBy(() -> downloader.download(new InstagramUrl("https://www.instagram.com/reel/post/")))
                .isInstanceOf(ExtractionFailedException.class);
        assertThat(requests).isEmpty();
    }

    @Test
    void 원본_대신_HTML이_반환되면_분석_파일로_사용하지_않는다() {
        // given
        imageMime = "text/html";
        InstagramMediaDownloader downloader = downloader(List.of(source("/image.jpg", "image")));

        // when & then
        assertThatThrownBy(() -> downloader.download(new InstagramUrl("https://www.instagram.com/p/post/")))
                .isInstanceOf(ExtractionFailedException.class);
    }

    private InstagramMediaSource source(String path, String type) {
        return new InstagramMediaSource(URI.create("https://test.cdninstagram.com" + path), type);
    }

    private InstagramMediaDownloader downloader(List<InstagramMediaSource> sources) {
        return new InstagramMediaDownloader(new FakeSourceReader(sources), client);
    }

    private Set<Path> temporaryMediaFiles() throws IOException {
        try (var files = Files.list(Path.of(System.getProperty("java.io.tmpdir")))) {
            return files.filter(path -> path.getFileName().toString().startsWith("yeogidam-media-"))
                    .collect(Collectors.toSet());
        }
    }

    private static class FakeSourceReader extends InstagramMediaSourceReader {

        private final List<InstagramMediaSource> sources;

        private FakeSourceReader(List<InstagramMediaSource> sources) {
            super(null, null);
            this.sources = sources;
        }

        @Override
        public List<InstagramMediaSource> read(InstagramUrl url) {
            return sources;
        }
    }
}
