package com.yeogidam.media.extraction.logging;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertAll;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.yeogidam.global.logging.RequestLoggingFilter;
import com.yeogidam.global.logging.RequestTimingContext;
import com.yeogidam.media.extraction.domain.ExtractionFailureReason;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

class ExtractionRequestTimingTest {

    private final Logger logger = (Logger) LoggerFactory.getLogger(ExtractionTimeline.class);
    private final ListAppender<ILoggingEvent> appender = new ListAppender<>();

    @BeforeEach
    void captureLogs() {
        appender.start();
        logger.addAppender(appender);
    }

    @AfterEach
    void clearContext() {
        ExtractionTimeline.clear();
        RequestTimingContext.clear();
        logger.detachAppender(appender);
        appender.stop();
    }

    @Test
    void 요청부터_메타_저장까지는_요청_시작_시각으로_재고_최종_로그에도_같은_값을_남긴다() {
        // given
        long requestStartedAt = System.nanoTime() - Duration.ofSeconds(1).toNanos();
        long queuedAt = requestStartedAt + Duration.ofMillis(500).toNanos();
        ExtractionTimeline.started(queuedAt, requestStartedAt);

        // when
        ExtractionTimeline.metadataStored();
        ExtractionTimeline.succeeded();

        // then
        ILoggingEvent metadata = stage("METADATA_STORED");
        ILoggingEvent succeeded = stage("SUCCEEDED");
        long requestToMetadataMs = (Long) value(metadata, "requestToMetadataMs");
        long sinceQueuedMs = (Long) value(metadata, "sinceQueuedMs");
        assertAll(
                () -> assertThat(requestToMetadataMs - sinceQueuedMs).isEqualTo(500),
                () -> assertThat(value(succeeded, "requestToMetadataMs")).isEqualTo(requestToMetadataMs)
        );
    }

    @Test
    void 요청_문맥이_없으면_요청부터_메타_저장까지의_시간은_생략한다() {
        // given
        ExtractionTimeline.started(System.nanoTime(), null);

        // when
        ExtractionTimeline.metadataStored();
        ExtractionTimeline.succeeded();

        // then
        assertAll(
                () -> assertThat(value(stage("METADATA_STORED"), "requestToMetadataMs")).isNull(),
                () -> assertThat(value(stage("SUCCEEDED"), "requestToMetadataMs")).isNull()
        );
    }

    @Test
    void 메타_저장_전에_실패하면_요청부터_메타_저장까지의_시간은_생략한다() {
        // given
        ExtractionTimeline.started(System.nanoTime(), System.nanoTime());

        // when
        ExtractionTimeline.failed(ExtractionFailureReason.UNEXPECTED);

        // then
        assertThat(value(stage("FAILED"), "requestToMetadataMs")).isNull();
    }

    @Test
    void 요청이_끝난_뒤_추출해도_등록할_때_복사한_요청_시작_시각을_쓴다() throws Exception {
        // given
        RequestLoggingFilter filter = new RequestLoggingFilter();
        ExtractionTaskDecorator decorator = new ExtractionTaskDecorator(new ThreadPoolTaskExecutor());
        AtomicReference<Runnable> extraction = new AtomicReference<>();
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/v1/shared-media");

        // when
        filter.doFilter(request, new MockHttpServletResponse(), (servletRequest, servletResponse) ->
                extraction.set(decorator.decorate(ExtractionTimeline::metadataStored)));
        assertThat(RequestTimingContext.startedAtNanos()).isNull();
        extraction.get().run();

        // then
        assertThat((Long) value(stage("METADATA_STORED"), "requestToMetadataMs"))
                .isNotNull()
                .isNotNegative();
    }

    private ILoggingEvent stage(String stage) {
        return appender.list.stream()
                .filter(event -> stage.equals(value(event, "extractionStage")))
                .findFirst()
                .orElseThrow();
    }

    private Object value(ILoggingEvent event, String key) {
        return event.getKeyValuePairs().stream()
                .filter(pair -> pair.key.equals(key))
                .map(pair -> pair.value)
                .findFirst()
                .orElse(null);
    }
}
