package com.yeogidam.support.fake;

import com.yeogidam.media.extraction.domain.PlaceSearchHint;
import com.yeogidam.media.extraction.domain.PlaceSearchHints;
import com.yeogidam.media.extraction.service.PlaceNameExtractor;
import com.yeogidam.media.instagram.domain.InstagramUrl;
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
    private final AtomicInteger mediaRequests = new AtomicInteger();
    private final AtomicReference<PlaceSearchHints> mediaHints = new AtomicReference<>();
    private final AtomicReference<RuntimeException> mediaFailure = new AtomicReference<>();
    private final AtomicReference<String> mediaCaption = new AtomicReference<>();
    private final AtomicReference<String> mediaUrl = new AtomicReference<>();
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

    @Override
    public PlaceSearchHints extractFile(String caption, InstagramUrl instagramUrl) {
        mediaRequests.incrementAndGet();
        mediaCaption.set(caption);
        mediaUrl.set(instagramUrl.getSharedUrl());
        if (mediaFailure.get() != null) {
            throw mediaFailure.get();
        }
        return mediaHints.get();
    }

    public void respondToMediaWith(List<PlaceSearchHint> places) {
        mediaHints.set(new PlaceSearchHints(places));
    }

    public void failMediaWith(RuntimeException exception) {
        mediaFailure.set(exception);
    }

    public int mediaRequestCount() {
        return mediaRequests.get();
    }

    public String mediaCaption() {
        return mediaCaption.get();
    }

    public String mediaUrl() {
        return mediaUrl.get();
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
        mediaRequests.set(0);
        respondToMediaWith(List.of());
        mediaFailure.set(null);
        mediaCaption.set(null);
        mediaUrl.set(null);
        started = new CountDownLatch(0);
        proceed = new CountDownLatch(0);
    }
}
