package com.yeogidam.media.extraction.infrastructure.loadtest;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpRequest;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.client.ClientHttpRequestExecution;
import org.springframework.http.client.ClientHttpRequestInterceptor;
import org.springframework.http.client.ClientHttpResponse;

@RequiredArgsConstructor
public class LoadTestRestClientInterceptor implements ClientHttpRequestInterceptor {

    private final LoadTestHttpRouting routing;
    private final LoadTestMetrics metrics;

    @Override
    public ClientHttpResponse intercept(HttpRequest request, byte[] body, ClientHttpRequestExecution execution)
            throws IOException {
        String service = routing.service(request.getURI());
        boolean fake = routing.isFake();
        long startedAt = System.nanoTime();
        HttpRequest routed = new RoutedRequest(request.getMethod(), routing.route(request.getURI()),
                routing.headers(request.getHeaders()), request.getAttributes());
        try {
            return new MeasuredResponse(execution.execute(routed, body), service, fake, startedAt, metrics);
        } catch (IOException | RuntimeException exception) {
            metrics.recordExternal(service, fake, startedAt, "error");
            throw exception;
        }
    }

    private record RoutedRequest(
            HttpMethod getMethod,
            URI getURI,
            HttpHeaders getHeaders,
            Map<String, Object> getAttributes
    ) implements HttpRequest {
    }

    private static class MeasuredResponse implements ClientHttpResponse {

        private final ClientHttpResponse delegate;
        private final String service;
        private final boolean fake;
        private final long startedAt;
        private final LoadTestMetrics metrics;
        private final AtomicBoolean recorded = new AtomicBoolean();

        private MeasuredResponse(
                ClientHttpResponse delegate,
                String service,
                boolean fake,
                long startedAt,
                LoadTestMetrics metrics
        ) {
            this.delegate = delegate;
            this.service = service;
            this.fake = fake;
            this.startedAt = startedAt;
            this.metrics = metrics;
        }

        @Override
        public HttpStatusCode getStatusCode() throws IOException {
            return delegate.getStatusCode();
        }

        @Override
        public String getStatusText() throws IOException {
            return delegate.getStatusText();
        }

        @Override
        public HttpHeaders getHeaders() {
            return delegate.getHeaders();
        }

        @Override
        public InputStream getBody() throws IOException {
            return new LoadTestMeasuredInputStream(
                    delegate.getBody(), delegate.getHeaders().getContentLength(), this::record);
        }

        @Override
        public void close() {
            try {
                delegate.close();
            } finally {
                record(false, 0);
            }
        }

        private void record(boolean received, long bodyBytes) {
            if (!recorded.compareAndSet(false, true)) {
                return;
            }
            String outcome = "error";
            try {
                if (received && delegate.getStatusCode().is2xxSuccessful()) {
                    outcome = "success";
                }
            } catch (IOException ignored) {
                // 상태를 읽을 수 없는 응답은 오류로 집계한다.
            }
            metrics.recordExternal(service, fake, startedAt, outcome, bodyBytes);
        }
    }
}
