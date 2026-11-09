package com.yeogidam.place.blog.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertAll;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import com.yeogidam.place.blog.config.NaverApiHubProperties;
import com.yeogidam.place.blog.config.PlaceBlogConfig;
import com.yeogidam.place.blog.domain.BlogPost;
import com.yeogidam.place.blog.domain.BlogSearchResult;
import com.yeogidam.place.blog.exception.PlaceBlogErrorCode;
import com.yeogidam.place.blog.exception.PlaceBlogException;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.web.client.RestClient;

/**
 * 네이버 블로그 검색 결과를 약관대로(순서와 내용을 바꾸지 않고) 옮기는지와, 네이버 오류를 502로 바꿀 예외로 알리는지 확인한다.
 */
class NaverBlogSearcherTest {

    private FakeNaverServer naverServer;

    @BeforeEach
    void setUp() throws IOException {
        naverServer = new FakeNaverServer();
    }

    @AfterEach
    void tearDown() {
        naverServer.close();
    }

    @Test
    void 검색어와_개수와_키로_정확도순_블로그_검색을_부른다() {
        // given
        naverServer.respondWith(items());

        // when
        searcher().search("카페 온월 성수동", 5);

        // then
        assertAll(
                () -> assertThat(naverServer.parameters())
                        .containsEntry("query", "카페 온월 성수동")
                        .containsEntry("display", "5")
                        .containsEntry("sort", "sim"),
                () -> assertThat(naverServer.header("X-NCP-APIGW-API-KEY-ID")).isEqualTo("test-key-id"),
                () -> assertThat(naverServer.header("X-NCP-APIGW-API-KEY")).isEqualTo("test-key"));
    }

    @Test
    void 장소_이름의_더하기_기호를_공백으로_바꾸지_않고_보낸다() {
        // given
        naverServer.respondWith(items());

        // when
        searcher().search("Dub.+ 연남동", 5);

        // then
        assertThat(naverServer.parameters()).containsEntry("query", "Dub.+ 연남동");
    }

    @Test
    void 강조_태그와_HTML_엔티티만_글자로_바꾸고_검색_결과_순서를_지킨다() {
        // given
        naverServer.respondWith(items(
                item("<b>카페 온월</b> &amp; 디저트 &lt;b&gt;", "성수 &quot;산책&quot;", "20261030",
                        "https://blog.naver.com/walk/1?a=1&amp;b=2"),
                item("성수동 <b>카페 온월</b> 후기", "카페 일기", "20261102", "https://blog.naver.com/diary/2")));

        // when
        BlogSearchResult result = searcher().search("카페 온월 성수동", 5);

        // then
        assertThat(result.source()).isEqualTo("NAVER");
        assertThat(result.posts()).containsExactly(
                new BlogPost("카페 온월 & 디저트 <b>", "성수 \"산책\"", LocalDate.of(2026, 10, 30),
                        "https://blog.naver.com/walk/1?a=1&b=2"),
                new BlogPost("성수동 카페 온월 후기", "카페 일기", LocalDate.of(2026, 11, 2),
                        "https://blog.naver.com/diary/2"));
    }

    @Test
    void 작은따옴표_엔티티도_글자로_바꾸고_한_번만_푼다() {
        // given
        naverServer.respondWith(items(
                item("Tom&apos;s 카페 &amp;apos;", "카페 일기", "20261030", "https://blog.naver.com/diary/2")));

        // when
        List<BlogPost> posts = searcher().search("Tom's 카페", 5).posts();

        // then
        assertThat(posts).extracting(BlogPost::title)
                .containsExactly("Tom's 카페 &apos;");
    }

    @ParameterizedTest
    @ValueSource(strings = {"2026-11-02", "20261341", ""})
    void 작성일을_읽지_못하면_작성일만_비운다(String postDate) {
        // given
        naverServer.respondWith(items(item("카페 온월 후기", "카페 일기", postDate, "https://blog.naver.com/diary/2")));

        // when
        List<BlogPost> posts = searcher().search("카페 온월 성수동", 5).posts();

        // then
        assertThat(posts).containsExactly(
                new BlogPost("카페 온월 후기", "카페 일기", null, "https://blog.naver.com/diary/2"));
    }

    @Test
    void 블로그_이름이_없으면_블로그_이름만_비운다() {
        // given
        naverServer.respondWith(items(
                "{\"title\":\"카페 온월 후기\",\"link\":\"https://blog.naver.com/diary/2\",\"postdate\":\"20261030\"}"));

        // when
        List<BlogPost> posts = searcher().search("카페 온월 성수동", 5).posts();

        // then
        assertThat(posts).containsExactly(
                new BlogPost("카페 온월 후기", null, LocalDate.of(2026, 10, 30), "https://blog.naver.com/diary/2"));
    }

    @Test
    void 제목이나_원문_주소가_없는_결과는_빼고_나머지_순서는_지킨다() {
        // given
        naverServer.respondWith(items(
                item("", "카페 일기", "20261030", "https://blog.naver.com/diary/1"),
                item("카페 온월 첫 후기", "카페 일기", "20261030", "https://blog.naver.com/diary/2"),
                item("<b></b>", "카페 일기", "20261030", "https://blog.naver.com/diary/3"),
                item("카페 온월 후기", "카페 일기", "20261030", ""),
                item("카페 온월 두 번째 후기", "카페 일기", "20261030", "https://blog.naver.com/diary/5")));

        // when
        List<BlogPost> posts = searcher().search("카페 온월 성수동", 5).posts();

        // then
        assertThat(posts).extracting(BlogPost::link)
                .containsExactly("https://blog.naver.com/diary/2", "https://blog.naver.com/diary/5");
    }

    @Test
    void 검색_결과가_없으면_빈_목록을_돌려준다() {
        // given
        naverServer.respondWith(items());

        // when & then
        assertThat(searcher().search("카페 온월 성수동", 5).posts()).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(ints = {401, 403, 429, 500})
    void 네이버가_오류를_돌려주면_블로그_검색_실패_예외가_발생한다(int status) {
        // given
        naverServer.respondWithStatus(status, "{\"errorCode\":\"SE99\",\"errorMessage\":\"System Error\"}");

        // when & then
        assertBlogSearchFailed(() -> searcher().search("카페 온월 성수동", 5));
    }

    @Test
    void 네이버가_200과_함께_JSON이_아닌_본문을_주면_블로그_검색_실패_예외가_발생한다() {
        // given
        naverServer.respondWithContentType("text/html", "<html>점검 중입니다</html>");

        // when & then
        assertBlogSearchFailed(() -> searcher().search("카페 온월 성수동", 5));
    }

    @Test
    void 네이버가_200과_함께_빈_본문을_주면_블로그_검색_실패_예외가_발생한다() {
        // given
        naverServer.respondWith("");

        // when & then
        assertBlogSearchFailed(() -> searcher().search("카페 온월 성수동", 5));
    }

    @Test
    @ExtendWith(OutputCaptureExtension.class)
    void 키에_헤더로_보낼_수_없는_글자가_섞이면_키를_남기지_않고_블로그_검색_실패_예외가_발생한다(CapturedOutput output) {
        // given: 복사한 키 끝에 보이지 않는 폭 없는 공백이 붙었다. 헤더 값은 운영 설정의 JDK 클라이언트가 검사한다.
        NaverApiHubProperties properties = new NaverApiHubProperties("test-key-id", "secret-blog-key\u200B");
        RestClient restClient = new PlaceBlogConfig().naverApiHubRestClient(RestClient.builder());
        NaverBlogSearcher searcher = new NaverBlogSearcher(restClient, properties, naverServer.endpoint());

        // when & then
        assertBlogSearchFailed(() -> searcher.search("카페 온월 성수동", 5));
        assertThatThrownBy(() -> searcher.search("카페 온월 성수동", 5)).hasNoCause();
        assertThat(output).doesNotContain("secret-blog-key");
    }

    @Test
    void 응답에_items_배열이_없으면_블로그_검색_실패_예외가_발생한다() {
        // given
        naverServer.respondWith("{\"total\":0}");

        // when & then
        assertBlogSearchFailed(() -> searcher().search("카페 온월 성수동", 5));
    }

    @Test
    void 네이버가_3초_안에_응답하지_않으면_블로그_검색_실패_예외가_발생한다() {
        // given: 운영과 같은 설정의 클라이언트를 4초 뒤에 답하는 서버에 붙인다
        naverServer.respondAfter(Duration.ofSeconds(4), items());
        RestClient restClient = new PlaceBlogConfig().naverApiHubRestClient(RestClient.builder());

        // when & then
        assertBlogSearchFailed(() -> searcher(restClient).search("카페 온월 성수동", 5));
    }

    private void assertBlogSearchFailed(Runnable search) {
        assertThatThrownBy(search::run)
                .isInstanceOf(PlaceBlogException.class)
                .extracting(exception -> ((PlaceBlogException) exception).getErrorCode())
                .isEqualTo(PlaceBlogErrorCode.BLOG_SEARCH_FAILED);
    }

    private NaverBlogSearcher searcher() {
        return searcher(RestClient.create());
    }

    private NaverBlogSearcher searcher(RestClient restClient) {
        NaverApiHubProperties properties = new NaverApiHubProperties("test-key-id", "test-key");
        return new NaverBlogSearcher(restClient, properties, naverServer.endpoint());
    }

    private String items(String... items) {
        return "{\"total\":" + items.length + ",\"items\":[" + String.join(",", items) + "]}";
    }

    private String item(String title, String bloggerName, String postDate, String link) {
        return """
                {"title":"%s","link":"%s","description":"요약","bloggername":"%s","bloggerlink":"blog.naver.com/x","postdate":"%s"}
                """.formatted(escapeJson(title), link, escapeJson(bloggerName), postDate);
    }

    private String escapeJson(String value) {
        return value.replace("\"", "\\\"");
    }

    private static class FakeNaverServer {

        private final HttpServer server;
        private Map<String, String> parameters = new HashMap<>();
        private Map<String, String> headers = new HashMap<>();
        private int status = 200;
        private String contentType = "application/json";
        private String body = "{\"items\":[]}";
        private Duration delay = Duration.ZERO;

        private FakeNaverServer() throws IOException {
            server = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
            server.createContext("/search/v1/blog", this::handle);
            server.start();
        }

        private void handle(HttpExchange exchange) throws IOException {
            parameters = readParameters(exchange.getRequestURI());
            headers = new HashMap<>();
            exchange.getRequestHeaders().forEach((name, values) -> headers.put(name.toLowerCase(), values.getFirst()));
            sleep();
            byte[] response = body.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", contentType);
            exchange.sendResponseHeaders(status, response.length);
            try (OutputStream output = exchange.getResponseBody()) {
                output.write(response);
            }
        }

        private void sleep() {
            try {
                Thread.sleep(delay);
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
            }
        }

        private Map<String, String> readParameters(URI requestUri) {
            Map<String, String> values = new HashMap<>();
            for (String parameter : requestUri.getRawQuery().split("&")) {
                String[] pair = parameter.split("=", 2);
                values.put(pair[0], URLDecoder.decode(pair.length > 1 ? pair[1] : "", StandardCharsets.UTF_8));
            }
            return values;
        }

        private void respondWith(String body) {
            this.body = body;
        }

        private void respondWithStatus(int status, String body) {
            this.status = status;
            this.body = body;
        }

        private void respondWithContentType(String contentType, String body) {
            this.contentType = contentType;
            this.body = body;
        }

        private void respondAfter(Duration delay, String body) {
            this.delay = delay;
            this.body = body;
        }

        private Map<String, String> parameters() {
            return parameters;
        }

        private String header(String name) {
            return headers.get(name.toLowerCase());
        }

        private URI endpoint() {
            return URI.create("http://localhost:" + server.getAddress().getPort() + "/search/v1/blog");
        }

        private void close() {
            server.stop(0);
        }
    }
}
