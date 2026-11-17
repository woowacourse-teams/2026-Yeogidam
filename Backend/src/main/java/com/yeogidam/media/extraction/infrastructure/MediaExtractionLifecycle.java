package com.yeogidam.media.extraction.infrastructure;

import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationListener;
import org.springframework.context.SmartLifecycle;
import org.springframework.context.event.ContextClosedEvent;

/** 일시 정지와 종료를 구분하고, 종료할 때 메타데이터 인계 후 분석 실행기를 닫는다. */
@RequiredArgsConstructor
public final class MediaExtractionLifecycle
        implements SmartLifecycle, ApplicationListener<ContextClosedEvent>, AutoCloseable {

    private final MediaExtractionExecutor metadataExecutor;
    private final MediaExtractionExecutor analysisExecutor;

    private volatile boolean running = true;
    private volatile boolean closing;

    @Override
    public void onApplicationEvent(ContextClosedEvent event) {
        closing = true;
    }

    @Override
    public void start() {
        running = true;
    }

    @Override
    public void stop() {
        stop(() -> { });
    }

    @Override
    public void stop(Runnable callback) {
        running = false;
        if (!closing) {
            callback.run();
            return;
        }
        metadataExecutor.stop(() -> analysisExecutor.stop(callback));
    }

    @Override
    public boolean isRunning() {
        return running;
    }

    @Override
    public int getPhase() {
        return Integer.MAX_VALUE / 2;
    }

    @Override
    public void close() {
        metadataExecutor.close();
        analysisExecutor.close();
    }
}
