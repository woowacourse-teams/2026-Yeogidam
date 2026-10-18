package com.yeogidam.media.instagram.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertAll;

import com.sun.net.httpserver.HttpServer;
import com.yeogidam.media.extraction.exception.ExtractionFailedException;
import com.yeogidam.media.instagram.domain.InstagramMediaSource;
import com.yeogidam.media.instagram.domain.InstagramUrl;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.json.JsonMapper;

class InstagramMediaSourceReaderTest {

    private final JsonMapper jsonMapper = JsonMapper.builder().build();

    @Test
    void 캐러셀의_이미지와_영상을_원본_순서로_모두_읽고_부모_썸네일을_사용하지_않는다() throws Exception {
        // given
        String html = """
                <script type="application/json">
                {"data":{"shortcode_media":{"shortcode":"post","display_url":"https://cdn/thumbnail.jpg",
                  "edge_sidecar_to_children":{"edges":[
                    {"node":{"is_video":false,"display_url":"https://cdn/first.jpg"}},
                    {"node":{"is_video":true,"video_url":"https://cdn/second.mp4"}},
                    {"node":{"is_video":false,"display_url":"https://cdn/third.jpg"}}
                  ]}}}}
                </script>
                """;

        // when
        var sources = readMedia(html);

        // then
        assertThat(sources).extracting(source -> source.uri().toString())
                .containsExactly("https://cdn/first.jpg", "https://cdn/second.mp4", "https://cdn/third.jpg");
        assertThat(sources).extracting(InstagramMediaSource::type).containsExactly("image", "video", "image");
    }

    @Test
    void 서버_스크립트_속_JSON_문자열에서도_대상_게시물의_원본을_읽는다() throws Exception {
        // given
        String payload = """
                {"metadata":{"shortcode":"post","copyright_blocked":false},
                 "gql_data":{"shortcode_media":{"shortcode":"post","is_video":true,
                 "display_url":"https://cdn/thumbnail.jpg","video_url":"https://cdn/original.mp4"}}}
                """;
        String data = jsonMapper.writeValueAsString(Map.of("require", new String[]{payload}));
        String html = "<script>requireLazy([],function(){s.handle(" + data + ");});</script>";

        // when & then
        assertThat(readMedia(html)).extracting(source -> source.uri().toString())
                .containsExactly("https://cdn/original.mp4");
    }

    @Test
    void 캐러셀_항목의_원본이_누락되면_일부_이미지만_반환하지_않는다() {
        // given
        String html = """
                <script>{"shortcode":"post","edge_sidecar_to_children":{"edges":[
                  {"node":{"display_url":"https://cdn/first.jpg"}},
                  {"node":{"is_video":true,"display_url":"https://cdn/thumbnail.jpg"}}
                ]}}</script>
                """;

        // when & then
        assertThatThrownBy(() -> readMedia(html)).isInstanceOf(ExtractionFailedException.class);
    }

    @Test
    void 대상과_다른_게시물의_미디어만_있으면_예외가_발생한다() {
        // given
        String html = "<script>{\"shortcode\":\"other\",\"display_url\":\"https://cdn/other.jpg\"}</script>";

        // when & then
        assertThatThrownBy(() -> readMedia(html)).isInstanceOf(ExtractionFailedException.class);
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void 릴스_포함_페이지에_썸네일만_있으면_일반_페이지나_공개_조회에서_영상_원본을_읽는다(boolean queryRequired)
            throws Exception {
        // given
        List<String> requests = new ArrayList<>();
        String thumbnail = """
                <script>{"shortcode":"ABC","display_url":"https://cdn/thumbnail.jpg"}</script>
                <script>["LSD",[],{"token":"test-public-token"}]</script>
                """;
        String video = """
                {"data":{"xig_polaris_media":{"code":"ABC","if_not_gated_logged_out":{
                  "code":"ABC","media_type":2,"video_versions":[{"url":"https://cdn/video.mp4"}]
                }}}}
                """;
        HttpServer server = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
        server.createContext("/", exchange -> {
            String path = exchange.getRequestURI().getPath();
            requests.add(path);
            String response = thumbnail;
            String mime = "text/html";
            if (!queryRequired && path.equals("/reel/ABC/")) {
                response = "<script>" + video + "</script>";
            }
            if (path.equals("/api/graphql")) {
                response = video;
                mime = "text/javascript";
            }
            byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", mime);
            exchange.sendResponseHeaders(200, bytes.length);
            try (var output = exchange.getResponseBody()) {
                output.write(bytes);
            }
        });
        server.start();
        URI base = URI.create("http://localhost:" + server.getAddress().getPort());
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory();
        RestClient client = RestClient.builder()
                .requestFactory((uri, method) -> factory.createRequest(base.resolve(uri.getPath()), method))
                .build();

        try {
            // when
            var sources = new InstagramMediaSourceReader(client, jsonMapper)
                    .read(new InstagramUrl("https://www.instagram.com/reel/ABC/"));

            // then
            assertAll(
                    () -> assertThat(sources).extracting(source -> source.uri().toString())
                            .containsExactly("https://cdn/video.mp4"),
                    () -> assertThat(sources).allMatch(InstagramMediaSource::isVideo)
            );
            if (queryRequired) {
                assertThat(requests).containsExactly("/reel/ABC/embed/", "/reel/ABC/", "/api/graphql");
                return;
            }
            assertThat(requests).containsExactly("/reel/ABC/embed/", "/reel/ABC/");
        } finally {
            server.stop(0);
        }
    }

    @Test
    void 모든_조회_경로에서_릴스_썸네일만_확보하면_예외가_발생한다() {
        // given
        String html = """
                <script>{"shortcode":"post","display_url":"https://cdn/thumbnail.jpg"}</script>
                <script>["LSD",[],{"token":"test-public-token"}]</script>
                """;
        InstagramUrl url = new InstagramUrl("https://www.instagram.com/reel/post/");

        // when & then
        assertThatThrownBy(() -> readMedia(html, url)).isInstanceOf(ExtractionFailedException.class);
    }

    private List<InstagramMediaSource> readMedia(String html) throws IOException {
        return readMedia(html, new InstagramUrl("https://www.instagram.com/p/post/"));
    }

    private List<InstagramMediaSource> readMedia(String html, InstagramUrl url) throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
        server.createContext("/", exchange -> {
            byte[] bytes = html.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "text/html");
            exchange.sendResponseHeaders(200, bytes.length);
            try (var output = exchange.getResponseBody()) {
                output.write(bytes);
            }
        });
        server.start();
        URI base = URI.create("http://localhost:" + server.getAddress().getPort());
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory();
        RestClient client = RestClient.builder()
                .requestFactory((uri, method) -> factory.createRequest(base.resolve(uri.getPath()), method))
                .build();
        try {
            return new InstagramMediaSourceReader(client, jsonMapper)
                    .read(url);
        } finally {
            server.stop(0);
        }
    }
}
