package com.yeogidam.support.fake;

import com.yeogidam.media.extraction.domain.PlaceSearchHint;
import com.yeogidam.media.extraction.domain.PlaceSearchHints;
import com.yeogidam.media.extraction.service.PlaceNameExtractor;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

public final class FakePlaceNameExtractor implements PlaceNameExtractor {

    private static final int TIMEOUT_SECONDS = 5;

    private final AtomicReference<PlaceSearchHints> hints = new AtomicReference<>();
    private final AtomicReference<RuntimeException> failure = new AtomicReference<>();
    private final AtomicInteger requests = new AtomicInteger();
    private volatile CountDownLatch started = new CountDownLatch(0);
    private volatile CountDownLatch proceed = new CountDownLatch(0);

    @Override
    public PlaceSearchHints extract(String caption) {
        requests.incrementAndGet();
        started.countDown();
        awaitPermission();
        RuntimeException nextFailure = failure.get();
        if (nextFailure != null) {
            throw nextFailure;
        }
        return hints.get();
    }

    private void awaitPermission() {
        try {
            if (!proceed.await(TIMEOUT_SECONDS, TimeUnit.SECONDS)) {
                throw new IllegalStateException("테스트가 추출을 5초 안에 허용하지 않았습니다.");
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("테스트 추출 대기가 중단되었습니다.", exception);
        }
    }

    public void block() {
        started = new CountDownLatch(1);
        proceed = new CountDownLatch(1);
    }

    public boolean awaitStarted() throws InterruptedException {
        return started.await(TIMEOUT_SECONDS, TimeUnit.SECONDS);
    }

    public void allow() {
        proceed.countDown();
    }

    public void respondWith(List<PlaceSearchHint> places) {
        hints.set(new PlaceSearchHints(places));
    }

    public void failWith(RuntimeException exception) {
        failure.set(exception);
    }

    public int requestCount() {
        return requests.get();
    }

    public void reset() {
        respondWith(List.of(new PlaceSearchHint("올드빅", null, List.of(), List.of(), null)));
        failure.set(null);
        requests.set(0);
        started = new CountDownLatch(0);
        proceed = new CountDownLatch(0);
    }
}
