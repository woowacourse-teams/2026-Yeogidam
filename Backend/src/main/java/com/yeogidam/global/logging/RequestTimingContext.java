package com.yeogidam.global.logging;

/** 요청 스레드의 시작 시각을 비동기 작업에 복사할 때만 사용하며 로그에는 원시 시각을 남기지 않는다. */
public final class RequestTimingContext {

    private static final ThreadLocal<Long> STARTED_AT = new ThreadLocal<>();

    private RequestTimingContext() {
    }

    public static void start(long startedAt) {
        STARTED_AT.set(startedAt);
    }

    public static Long startedAtNanos() {
        return STARTED_AT.get();
    }

    public static void clear() {
        STARTED_AT.remove();
    }
}
