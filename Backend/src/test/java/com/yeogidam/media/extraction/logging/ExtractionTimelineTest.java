package com.yeogidam.media.extraction.logging;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertAll;

import com.yeogidam.media.extraction.logging.ExtractionTimeline.ExternalCall;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

class ExtractionTimelineTest {

    @Test
    void 추출_작업_안에서_외부_호출을_재도_호출_결과와_예외는_그대로_넘긴다() throws InterruptedException {
        // given
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(1);
        executor.setTaskDecorator(new ExtractionTaskDecorator(executor));
        executor.initialize();
        IllegalStateException geminiFailure = new IllegalStateException("Gemini 요청 한도 초과");
        AtomicReference<String> searchResult = new AtomicReference<>();
        AtomicReference<RuntimeException> thrown = new AtomicReference<>();
        CountDownLatch done = new CountDownLatch(1);

        try {
            // when
            executor.execute(() -> {
                searchResult.set(ExtractionTimeline.measure(ExternalCall.PLACE_SEARCH, () -> "검색 결과"));
                try {
                    ExtractionTimeline.measure(ExternalCall.GEMINI, () -> {
                        throw geminiFailure;
                    });
                } catch (IllegalStateException exception) {
                    thrown.set(exception);
                }
                done.countDown();
            });

            // then
            assertThat(done.await(5, TimeUnit.SECONDS)).isTrue();
            assertAll(
                    () -> assertThat(searchResult.get()).isEqualTo("검색 결과"),
                    () -> assertThat(thrown.get()).isSameAs(geminiFailure)
            );
        } finally {
            executor.shutdown();
        }
    }
}
