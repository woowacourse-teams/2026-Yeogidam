package com.yeogidam.media.extraction.eval;

import java.io.IOException;
import java.time.Duration;
import java.util.concurrent.TimeUnit;
import java.util.function.LongSupplier;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpRequest;
import org.springframework.http.client.ClientHttpRequestExecution;
import org.springframework.http.client.ClientHttpRequestInterceptor;
import org.springframework.http.client.ClientHttpResponse;

/** 평가 실행의 캡션, 첨부 분석과 예비 키 재요청 사이에 5초 간격을 둔다. */
final class GeminiEvalRequestLimiter implements ClientHttpRequestInterceptor {

    private static final long INTERVAL_NANOS = Duration.ofSeconds(5).toNanos();

    private final LongSupplier nanoTime;
    private final Sleeper sleeper;
    private Long lastStartedAt;

    GeminiEvalRequestLimiter() {
        this(System::nanoTime, TimeUnit.NANOSECONDS::sleep);
    }

    GeminiEvalRequestLimiter(LongSupplier nanoTime, Sleeper sleeper) {
        this.nanoTime = nanoTime;
        this.sleeper = sleeper;
    }

    @Override
    public synchronized ClientHttpResponse intercept(
            HttpRequest request,
            byte[] body,
            ClientHttpRequestExecution execution
    ) throws IOException {
        if (isAnalysis(request)) {
            awaitNextRequest();
        }
        return execution.execute(request, body);
    }

    private boolean isAnalysis(HttpRequest request) {
        String path = request.getURI().getPath();
        return request.getMethod() == HttpMethod.POST
                && (path.equals("/v1/interactions") || path.endsWith(":generateContent"));
    }

    private void awaitNextRequest() throws IOException {
        if (lastStartedAt != null) {
            awaitInterval();
        }
        lastStartedAt = nanoTime.getAsLong();
    }

    private void awaitInterval() throws IOException {
        long remaining = INTERVAL_NANOS - (nanoTime.getAsLong() - lastStartedAt);
        while (remaining > 0) {
            sleep(remaining);
            remaining = INTERVAL_NANOS - (nanoTime.getAsLong() - lastStartedAt);
        }
    }

    private void sleep(long nanoseconds) throws IOException {
        try {
            sleeper.sleep(nanoseconds);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IOException("Gemini 평가 요청 간격 대기가 중단됐습니다.", exception);
        }
    }

    @FunctionalInterface
    interface Sleeper {

        void sleep(long nanoseconds) throws InterruptedException;
    }
}
