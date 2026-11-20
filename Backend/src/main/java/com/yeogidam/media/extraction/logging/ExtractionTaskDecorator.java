package com.yeogidam.media.extraction.logging;

import com.yeogidam.global.logging.RequestTimingContext;
import java.util.Map;
import java.util.function.IntSupplier;
import org.slf4j.MDC;
import org.springframework.core.task.TaskDecorator;

/**
 * 추출 작업을 큐에 넣을 때 요청 스레드의 MDC(requestId, mediaId)를 복사해 두었다가 추출 스레드에 그대로 옮긴다.
 * 그래서 추출 스레드가 남기는 로그에도 공유 요청과 같은 requestId가 붙고, 큐 등록과 작업 시작 시각을 {@link ExtractionTimeline}에 남긴다.
 */
public class ExtractionTaskDecorator implements TaskDecorator {

    private final IntSupplier queueSize;
    private final IntSupplier activeCount;

    // 큐 등록 줄에 실을 대기 작업 수와 일하는 스레드 수를 실행기에서 읽는다.
    public ExtractionTaskDecorator(IntSupplier queueSize, IntSupplier activeCount) {
        this.queueSize = queueSize;
        this.activeCount = activeCount;
    }

    @Override
    public Runnable decorate(Runnable task) {
        Map<String, String> context = MDC.getCopyOfContextMap();
        Long requestStartedAt = RequestTimingContext.startedAtNanos();
        long queuedAt = ExtractionTimeline.queued(queueSize.getAsInt(), activeCount.getAsInt());
        return () -> run(task, context, queuedAt, requestStartedAt);
    }

    private void run(
            Runnable task,
            Map<String, String> context,
            long queuedAt,
            Long requestStartedAt
    ) {
        if (context == null) {
            MDC.clear();
        } else {
            MDC.setContextMap(context);
        }
        ExtractionTimeline.started(queuedAt, requestStartedAt);
        try {
            task.run();
        } finally {
            ExtractionTimeline.clear();
            // 추출 스레드는 다음 작업에 다시 쓰이므로, 비우지 않으면 다음 작업 로그에 이번 requestId와 mediaId가 붙는다.
            MDC.clear();
        }
    }
}
