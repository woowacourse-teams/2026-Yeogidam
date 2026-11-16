package com.yeogidam.media.extraction.logging;

import com.yeogidam.media.extraction.logging.ExtractionTimeline.Handoff;
import java.util.Map;
import org.slf4j.MDC;
import org.springframework.core.task.TaskDecorator;

/**
 * 메타데이터 스레드가 분석 작업을 넘길 때 MDC(requestId, mediaId)와 {@link ExtractionTimeline} 기록을 함께 분석 스레드로 옮긴다.
 * 그래서 분석 스레드의 로그에도 공유 요청과 같은 requestId가 붙고, 작업 끝 줄에 큐 등록부터 분석 완료까지의 구간이 모두 실린다.
 * 큐 등록과 작업 시작 줄은 메타데이터 단계에서 이미 남겼으므로 다시 남기지 않고, 분석 큐 대기 시간만 남긴다.
 */
public class ExtractionHandoffTaskDecorator implements TaskDecorator {

    @Override
    public Runnable decorate(Runnable task) {
        Map<String, String> context = MDC.getCopyOfContextMap();
        Handoff handoff = ExtractionTimeline.handOff();
        return () -> run(task, context, handoff);
    }

    private void run(
            Runnable task,
            Map<String, String> context,
            Handoff handoff
    ) {
        if (context == null) {
            MDC.clear();
        } else {
            MDC.setContextMap(context);
        }
        ExtractionTimeline.resume(handoff);
        try {
            task.run();
        } finally {
            ExtractionTimeline.clear();
            // 분석 스레드도 다음 작업에 다시 쓰이므로, 비우지 않으면 다음 작업 로그에 이번 requestId와 mediaId가 붙는다.
            MDC.clear();
        }
    }
}
