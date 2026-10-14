package com.yeogidam.media.extraction.infrastructure.loadtest;

public final class LoadTestScope implements AutoCloseable {

    private static final ThreadLocal<String> SHORTCODE = new ThreadLocal<>();

    private final String previous;

    private LoadTestScope(String shortcode) {
        previous = SHORTCODE.get();
        SHORTCODE.set(shortcode);
    }

    public static LoadTestScope open(String shortcode) {
        return new LoadTestScope(shortcode);
    }

    public static String currentShortcode() {
        return SHORTCODE.get();
    }

    @Override
    public void close() {
        if (previous == null) {
            SHORTCODE.remove();
            return;
        }
        SHORTCODE.set(previous);
    }
}
