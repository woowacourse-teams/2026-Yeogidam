package com.yeogidam.media.extraction.logging;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertAll;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.yeogidam.media.extraction.domain.ExtractionFailureReason;
import com.yeogidam.media.extraction.infrastructure.MediaExtractionExecutor;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;

class ExtractionHandoffTaskDecoratorTest {

    private static final String REQUEST_ID = "requestId";

    private final Logger logger = (Logger) LoggerFactory.getLogger(ExtractionTimeline.class);
    private final ListAppender<ILoggingEvent> appender = new ListAppender<>();
    private MediaExtractionExecutor metadataExecutor;
    private MediaExtractionExecutor analysisExecutor;

    @BeforeEach
    void setUp() {
        appender.start();
        logger.addAppender(appender);
        metadataExecutor = new MediaExtractionExecutor("test-metadata-", 1, 10);
        metadataExecutor.setTaskDecorator(
                new ExtractionTaskDecorator(metadataExecutor::getQueueSize, metadataExecutor::getActiveCount));
        analysisExecutor = new MediaExtractionExecutor("test-analysis-", 1, 10);
        analysisExecutor.setTaskDecorator(new ExtractionHandoffTaskDecorator());
    }

    @AfterEach
    void tearDown() {
        metadataExecutor.close();
        analysisExecutor.close();
        MDC.clear();
        logger.detachAppender(appender);
        appender.stop();
    }

    @Test
    void 분석_스레드로_넘겨도_requestId와_단계_기록이_한_작업으로_이어진다() throws InterruptedException {
        // given
        AtomicReference<String> analysisRequestId = new AtomicReference<>();
        CountDownLatch done = new CountDownLatch(1);

        // when
        MDC.put(REQUEST_ID, "share-request");
        metadataExecutor.execute(() -> {
            ExtractionTimeline.metadataStored();
            analysisExecutor.execute(() -> {
                analysisRequestId.set(MDC.get(REQUEST_ID));
                ExtractionTimeline.succeeded();
                done.countDown();
            });
        });
        MDC.clear();

        // then
        assertThat(done.await(5, TimeUnit.SECONDS)).isTrue();
        ILoggingEvent end = single("SUCCEEDED");
        assertAll(
                () -> assertThat(analysisRequestId.get()).isEqualTo("share-request"),
                () -> assertThat(stages()).containsExactly(
                        "QUEUED", "STARTED", "METADATA_STORED", "ANALYSIS_STARTED", "SUCCEEDED"),
                () -> assertThat(end.getThreadName()).startsWith("test-analysis-"),
                () -> assertThat(value(end, "firstStageMs")).isNotNull(),
                () -> assertThat(value(end, "secondStageMs")).isNotNull(),
                () -> assertThat((Long) value(end, "analysisQueueWaitMs")).isNotNegative()
        );
    }

    @Test
    void 분석_접수가_거절되면_메타데이터_스레드가_실패_끝_줄_하나만_남긴다() throws InterruptedException {
        // given
        analysisExecutor.stop();
        AtomicReference<String> failureRequestId = new AtomicReference<>();
        CountDownLatch done = new CountDownLatch(1);

        // when
        MDC.put(REQUEST_ID, "rejected-request");
        metadataExecutor.execute(() -> {
            ExtractionTimeline.metadataStored();
            try {
                analysisExecutor.execute(ExtractionTimeline::succeeded);
            } catch (RuntimeException exception) {
                failureRequestId.set(MDC.get(REQUEST_ID));
                ExtractionTimeline.failed(ExtractionFailureReason.PROCESSING_FAILED);
            }
            done.countDown();
        });
        MDC.clear();

        // then
        assertThat(done.await(5, TimeUnit.SECONDS)).isTrue();
        assertAll(
                () -> assertThat(stages()).containsExactly("QUEUED", "STARTED", "METADATA_STORED", "FAILED"),
                () -> assertThat(single("FAILED").getThreadName()).startsWith("test-metadata-"),
                () -> assertThat(value(single("FAILED"), "analysisQueueWaitMs")).isNull(),
                () -> assertThat(failureRequestId.get()).isEqualTo("rejected-request")
        );
    }

    private List<Object> stages() {
        return appender.list.stream()
                .map(event -> value(event, "extractionStage"))
                .toList();
    }

    private ILoggingEvent single(String stage) {
        List<ILoggingEvent> events = appender.list.stream()
                .filter(event -> stage.equals(value(event, "extractionStage")))
                .toList();
        assertThat(events).hasSize(1);
        return events.getFirst();
    }

    private Object value(ILoggingEvent event, String key) {
        return event.getKeyValuePairs().stream()
                .filter(pair -> pair.key.equals(key))
                .map(pair -> pair.value)
                .findFirst()
                .orElse(null);
    }
}
