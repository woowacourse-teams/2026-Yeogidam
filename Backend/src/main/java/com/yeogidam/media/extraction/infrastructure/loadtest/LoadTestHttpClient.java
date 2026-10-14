package com.yeogidam.media.extraction.infrastructure.loadtest;

import java.io.IOException;
import java.io.InputStream;
import java.net.Authenticator;
import java.net.CookieHandler;
import java.net.ProxySelector;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpHeaders;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executor;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLParameters;
import javax.net.ssl.SSLSession;
import lombok.RequiredArgsConstructor;

/** 이미지 다운로드와 카카오 장소 페이지도 실제 JDK HTTP 클라이언트를 통과시킨다. */
@RequiredArgsConstructor
public class LoadTestHttpClient extends HttpClient {

    private final HttpClient delegate;
    private final LoadTestHttpRouting routing;
    private final LoadTestMetrics metrics;

    @Override
    public <T> HttpResponse<T> send(HttpRequest request, HttpResponse.BodyHandler<T> handler)
            throws IOException, InterruptedException {
        boolean fake = routing.isFake();
        String service = routing.service(request.uri());
        long startedAt = System.nanoTime();
        try {
            HttpResponse<T> response = delegate.send(route(request), handler);
            return measuredResponse(response, request, service, fake, startedAt);
        } catch (IOException | InterruptedException | RuntimeException exception) {
            metrics.recordExternal(service, fake, startedAt, "error");
            throw exception;
        }
    }

    private HttpRequest route(HttpRequest request) {
        if (!routing.isFake()) {
            return request;
        }
        HttpRequest.Builder builder = HttpRequest.newBuilder(routing.route(request.uri()))
                .method(request.method(), request.bodyPublisher().orElse(HttpRequest.BodyPublishers.noBody()));
        request.timeout().ifPresent(builder::timeout);
        org.springframework.http.HttpHeaders original = new org.springframework.http.HttpHeaders();
        original.putAll(request.headers().map());
        routing.headers(original).forEach((name, values) -> values.forEach(value -> builder.header(name, value)));
        return builder.build();
    }

    @SuppressWarnings("unchecked")
    private <T> HttpResponse<T> measuredResponse(
            HttpResponse<T> response,
            HttpRequest original,
            String service,
            boolean fake,
            long startedAt
    ) {
        String outcome = "error";
        if (response.statusCode() >= 200 && response.statusCode() < 300) {
            outcome = "success";
        }
        String finalOutcome = outcome;
        T body = response.body();
        if (body instanceof InputStream stream) {
            long contentLength = response.headers().firstValueAsLong("Content-Length").orElse(-1);
            body = (T) new LoadTestMeasuredInputStream(stream, contentLength,
                    (received, bodyBytes) -> recordBody(service, fake, startedAt, finalOutcome, received, bodyBytes));
        } else {
            metrics.recordExternal(service, fake, startedAt, outcome, -1);
        }
        return new RoutedResponse<>(response, original, body);
    }

    private void recordBody(
            String service,
            boolean fake,
            long startedAt,
            String outcome,
            boolean received,
            long bodyBytes
    ) {
        if (received) {
            metrics.recordExternal(service, fake, startedAt, outcome, bodyBytes);
            return;
        }
        metrics.recordExternal(service, fake, startedAt, "error", bodyBytes);
    }

    @Override
    public <T> CompletableFuture<HttpResponse<T>> sendAsync(HttpRequest request, HttpResponse.BodyHandler<T> handler) {
        return sendAsync(request, handler, null);
    }

    @Override
    public <T> CompletableFuture<HttpResponse<T>> sendAsync(
            HttpRequest request,
            HttpResponse.BodyHandler<T> handler,
            HttpResponse.PushPromiseHandler<T> pushHandler
    ) {
        boolean fake = routing.isFake();
        String service = routing.service(request.uri());
        long startedAt = System.nanoTime();
        CompletableFuture<HttpResponse<T>> response = delegate.sendAsync(route(request), handler, pushHandler);
        return response.whenComplete((result, exception) -> {
                    if (exception != null) {
                        metrics.recordExternal(service, fake, startedAt, "error");
                    }
                })
                .thenApply(result -> measuredResponse(result, request, service, fake, startedAt));
    }

    @Override
    public Optional<CookieHandler> cookieHandler() {
        return delegate.cookieHandler();
    }

    @Override
    public Optional<Duration> connectTimeout() {
        return delegate.connectTimeout();
    }

    @Override
    public Redirect followRedirects() {
        return delegate.followRedirects();
    }

    @Override
    public Optional<ProxySelector> proxy() {
        return delegate.proxy();
    }

    @Override
    public SSLContext sslContext() {
        return delegate.sslContext();
    }

    @Override
    public SSLParameters sslParameters() {
        return delegate.sslParameters();
    }

    @Override
    public Optional<Authenticator> authenticator() {
        return delegate.authenticator();
    }

    @Override
    public Version version() {
        return delegate.version();
    }

    @Override
    public Optional<Executor> executor() {
        return delegate.executor();
    }

    @Override
    public void close() {
        delegate.close();
    }

    @Override
    public void shutdown() {
        delegate.shutdown();
    }

    @Override
    public void shutdownNow() {
        delegate.shutdownNow();
    }

    @Override
    public boolean awaitTermination(Duration duration) throws InterruptedException {
        return delegate.awaitTermination(duration);
    }

    @Override
    public boolean isTerminated() {
        return delegate.isTerminated();
    }

    private record RoutedResponse<T>(HttpResponse<T> delegate, HttpRequest request, T body) implements HttpResponse<T> {

        @Override
        public int statusCode() {
            return delegate.statusCode();
        }

        @Override
        public Optional<HttpResponse<T>> previousResponse() {
            return delegate.previousResponse();
        }

        @Override
        public HttpHeaders headers() {
            return delegate.headers();
        }

        @Override
        public Optional<SSLSession> sslSession() {
            return delegate.sslSession();
        }

        @Override
        public URI uri() {
            return request.uri();
        }

        @Override
        public Version version() {
            return delegate.version();
        }
    }
}
