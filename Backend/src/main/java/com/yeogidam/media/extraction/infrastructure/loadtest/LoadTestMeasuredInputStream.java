package com.yeogidam.media.extraction.infrastructure.loadtest;

import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.BiConsumer;

/** 본문 수신 시점에 측정을 끝내 이미지 처리 시간을 외부 지연에 중복 반영하지 않는다. */
final class LoadTestMeasuredInputStream extends FilterInputStream {

    private final long contentLength;
    private final BiConsumer<Boolean, Long> completed;
    private final AtomicBoolean recorded = new AtomicBoolean();
    private long received;

    LoadTestMeasuredInputStream(InputStream stream, long contentLength, BiConsumer<Boolean, Long> completed) {
        super(stream);
        this.contentLength = contentLength;
        this.completed = completed;
        if (contentLength == 0) {
            record(true);
        }
    }

    @Override
    public int read() throws IOException {
        try {
            int value = in.read();
            if (value < 0) {
                record(true);
                return value;
            }
            received(1);
            return value;
        } catch (IOException exception) {
            record(false);
            throw exception;
        }
    }

    @Override
    public int read(byte[] bytes, int offset, int length) throws IOException {
        try {
            int count = in.read(bytes, offset, length);
            if (count < 0) {
                record(true);
                return count;
            }
            received(count);
            return count;
        } catch (IOException exception) {
            record(false);
            throw exception;
        }
    }

    private void received(int count) {
        received += count;
        if (contentLength >= 0 && received >= contentLength) {
            record(true);
        }
    }

    private void record(boolean success) {
        if (recorded.compareAndSet(false, true)) {
            completed.accept(success, received);
        }
    }

    @Override
    public void close() throws IOException {
        try {
            super.close();
        } finally {
            record(false);
        }
    }
}
