package com.yeogidam.media.extraction.logging;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertAll;

import com.yeogidam.media.extraction.config.ExtractionConfig;
import com.yeogidam.media.extraction.config.LoadTestProperties;
import com.yeogidam.media.extraction.infrastructure.loadtest.LoadTestBeanPostProcessor;
import com.yeogidam.media.extraction.infrastructure.loadtest.LoadTestHttpRouting;
import com.yeogidam.media.extraction.infrastructure.loadtest.LoadTestMetrics;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.net.URI;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.core.env.MapPropertySource;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.web.client.RestClient;

class ExtractionTaskDecoratorTest {

    private static final String REQUEST_ID = "requestId";

    @AfterEach
    void clearMdc() {
        MDC.clear();
    }

    @Test
    void 추출_작업_로그에는_작업을_등록한_요청의_requestId만_붙는다() throws InterruptedException {
        // given: 스레드 하나가 두 작업을 차례로 맡게 해서, 앞 작업의 값이 뒤 작업에 남는지 본다.
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(1);
        executor.setMaxPoolSize(1);
        executor.setTaskDecorator(new ExtractionTaskDecorator(executor));
        executor.initialize();
        AtomicReference<String> first = new AtomicReference<>();
        AtomicReference<String> second = new AtomicReference<>("실행 안 됨");
        CountDownLatch done = new CountDownLatch(2);

        try {
            // when
            MDC.put(REQUEST_ID, "share-request");
            executor.execute(() -> {
                first.set(MDC.get(REQUEST_ID));
                done.countDown();
            });
            MDC.clear();
            executor.execute(() -> {
                second.set(MDC.get(REQUEST_ID));
                done.countDown();
            });

            // then
            assertThat(done.await(5, TimeUnit.SECONDS)).isTrue();
            assertAll(
                    () -> assertThat(first.get()).isEqualTo("share-request"),
                    () -> assertThat(second.get()).isNull()
            );
        } finally {
            executor.shutdown();
        }
    }

    @Test
    void 부하_테스트를_켜도_단계_로그와_부하_테스트_큐_대기_측정이_함께_붙는다() throws InterruptedException {
        // given
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        AtomicReference<String> requestId = new AtomicReference<>();
        CountDownLatch done = new CountDownLatch(1);

        try (AnnotationConfigApplicationContext context = createLoadTestContext(registry)) {
            ThreadPoolTaskExecutor executor = context.getBean("mediaExtractionExecutor", ThreadPoolTaskExecutor.class);

            // when
            MDC.put(REQUEST_ID, "load-test-request");
            executor.execute(() -> {
                requestId.set(MDC.get(REQUEST_ID));
                done.countDown();
            });

            // then
            assertThat(done.await(5, TimeUnit.SECONDS)).isTrue();
            assertAll(
                    () -> assertThat(requestId.get()).isEqualTo("load-test-request"),
                    () -> assertThat(registry.timer("media.extraction.queue.wait").count()).isEqualTo(1)
            );
        }
    }

    private AnnotationConfigApplicationContext createLoadTestContext(SimpleMeterRegistry registry) {
        var context = new AnnotationConfigApplicationContext();
        context.getEnvironment().getPropertySources().addFirst(new MapPropertySource("test", Map.of(
                "media.extraction.pipeline-version", "1",
                "media.extraction.pool.core-size", "1",
                "media.extraction.pool.max-size", "1",
                "media.extraction.pool.queue-capacity", "10",
                "media.extraction.gemini.api-key", "test",
                "media.extraction.gemini.model", "test",
                "media.extraction.kakao.api-key", "test")));
        context.register(ExtractionConfig.class);
        context.registerBean(RestClient.Builder.class, () -> RestClient.builder(), bean -> bean.setScope("prototype"));
        context.registerBean(LoadTestMetrics.class, () -> new LoadTestMetrics(registry));
        context.registerBean(LoadTestHttpRouting.class, () -> new LoadTestHttpRouting(
                new LoadTestProperties(URI.create("http://127.0.0.1:1"), "fake-key", "ydlt_test_", Set.of(1L))));
        context.registerBean(LoadTestBeanPostProcessor.class,
                () -> new LoadTestBeanPostProcessor(context.getBeanFactory()));
        context.refresh();
        return context;
    }
}
