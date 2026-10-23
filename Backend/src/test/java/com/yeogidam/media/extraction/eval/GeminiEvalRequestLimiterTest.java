package com.yeogidam.media.extraction.eval;

import java.io.IOException;
import java.net.URI;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.client.ClientHttpRequest;
import org.springframework.http.client.ClientHttpRequestFactory;
import org.springframework.mock.http.client.MockClientHttpRequest;
import org.springframework.mock.http.client.MockClientHttpResponse;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

class GeminiEvalRequestLimiterTest {

    private static final String CAPTION_URL = "https://gemini.example/v1/interactions";
    private static final String MEDIA_URL = "https://gemini.example/v1beta/models/test:generateContent";

    @Test
    void 캡션과_첨부가_같은_제한기를_사용해_1분에_15회를_넘지_않는다() {
        // given
        FakeTime time = new FakeTime();
        FakeGeminiServer server = new FakeGeminiServer(time);
        GeminiEvalRequestLimiter limiter = new GeminiEvalRequestLimiter(time::now, time::sleep);
        RestClient captionClient = client(server, limiter);
        RestClient mediaClient = client(server, limiter);

        // when
        for (int index = 0; index < 8; index++) {
            captionClient.post().uri(CAPTION_URL).retrieve().toBodilessEntity();
            mediaClient.post().uri(MEDIA_URL).retrieve().toBodilessEntity();
        }

        // then
        Assertions.assertThat(server.startedAt).hasSize(16);
        Assertions.assertThat(server.startedAt.getFirst()).isZero();
        for (int index = 1; index < server.startedAt.size(); index++) {
            Assertions.assertThat(server.startedAt.get(index) - server.startedAt.get(index - 1))
                    .isEqualTo(Duration.ofSeconds(5).toNanos());
        }
        Assertions.assertThat(server.startedAt.stream().filter(start -> start < Duration.ofMinutes(1).toNanos()))
                .hasSize(12);
    }

    @Test
    void 분석이_503으로_실패해_예비_키로_요청해도_5초_간격을_지킨다() {
        // given
        FakeTime time = new FakeTime();
        FakeGeminiServer server = new FakeGeminiServer(time);
        RestClient client = client(server, new GeminiEvalRequestLimiter(time::now, time::sleep));
        server.status = HttpStatus.SERVICE_UNAVAILABLE;
        Assertions.assertThatThrownBy(() -> client.post().uri(CAPTION_URL)
                        .header("x-goog-api-key", "free-key").retrieve().toBodilessEntity())
                .isInstanceOf(RestClientResponseException.class);
        server.status = HttpStatus.OK;

        // when
        client.post().uri(CAPTION_URL).header("x-goog-api-key", "fallback-key").retrieve().toBodilessEntity();

        // then
        Assertions.assertThat(server.startedAt).containsExactly(0L, Duration.ofSeconds(5).toNanos());
    }

    @Test
    void 파일_업로드와_조회와_삭제는_분석_간격을_소비하지_않는다() {
        // given
        FakeTime time = new FakeTime();
        FakeGeminiServer server = new FakeGeminiServer(time);
        RestClient client = client(server, new GeminiEvalRequestLimiter(time::now, time::sleep));
        client.post().uri(CAPTION_URL).retrieve().toBodilessEntity();

        // when
        client.post().uri("https://gemini.example/upload/v1beta/files").retrieve().toBodilessEntity();
        client.get().uri("https://gemini.example/v1beta/files/example").retrieve().toBodilessEntity();
        client.delete().uri("https://gemini.example/v1beta/files/example").retrieve().toBodilessEntity();
        client.post().uri(MEDIA_URL).retrieve().toBodilessEntity();

        // then
        Assertions.assertThat(server.startedAt).containsExactly(0L, 0L, 0L, 0L, Duration.ofSeconds(5).toNanos());
    }

    @Test
    void 다른_처리로_5초가_지났으면_추가로_대기하지_않는다() {
        // given
        FakeTime time = new FakeTime();
        FakeGeminiServer server = new FakeGeminiServer(time);
        RestClient client = client(server, new GeminiEvalRequestLimiter(time::now, time::sleep));
        client.post().uri(CAPTION_URL).retrieve().toBodilessEntity();
        time.sleep(Duration.ofSeconds(7).toNanos());

        // when
        client.post().uri(MEDIA_URL).retrieve().toBodilessEntity();

        // then
        Assertions.assertThat(server.startedAt).containsExactly(0L, Duration.ofSeconds(7).toNanos());
    }

    @Test
    void 대기_중_인터럽트가_발생하면_다음_요청을_보내지_않고_예외가_발생한다() throws IOException {
        // given
        FakeTime time = new FakeTime();
        FakeGeminiServer server = new FakeGeminiServer(time);
        GeminiEvalRequestLimiter limiter = new GeminiEvalRequestLimiter(time::now, nanoseconds -> {
            throw new InterruptedException();
        });
        MockClientHttpRequest request = new MockClientHttpRequest(HttpMethod.POST, URI.create(CAPTION_URL));
        limiter.intercept(request, new byte[0], (sent, body) -> server.createRequest(sent.getURI(), sent.getMethod()).execute());

        // when & then
        try {
            Assertions.assertThatThrownBy(() -> limiter.intercept(request, new byte[0],
                            (sent, body) -> server.createRequest(sent.getURI(), sent.getMethod()).execute()))
                    .isInstanceOf(IOException.class)
                    .hasCauseInstanceOf(InterruptedException.class);
            Assertions.assertThat(Thread.currentThread().isInterrupted()).isTrue();
            Assertions.assertThat(server.startedAt).containsExactly(0L);
        } finally {
            Thread.interrupted();
        }
    }

    private RestClient client(FakeGeminiServer server, GeminiEvalRequestLimiter limiter) {
        return RestClient.builder()
                .requestFactory(server)
                .requestInterceptor(limiter)
                .build();
    }

    private static class FakeTime {

        private long nanoseconds;

        private long now() {
            return nanoseconds;
        }

        private void sleep(long duration) {
            nanoseconds += duration;
        }
    }

    private static class FakeGeminiServer implements ClientHttpRequestFactory {

        private final FakeTime time;
        private final List<Long> startedAt = new ArrayList<>();
        private HttpStatus status = HttpStatus.OK;

        private FakeGeminiServer(FakeTime time) {
            this.time = time;
        }

        @Override
        public ClientHttpRequest createRequest(URI uri, HttpMethod method) {
            startedAt.add(time.now());
            MockClientHttpRequest request = new MockClientHttpRequest(method, uri);
            request.setResponse(new MockClientHttpResponse(new byte[0], status));
            return request;
        }
    }
}
