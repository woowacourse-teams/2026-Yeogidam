package com.yeogidam.media.extraction.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertAll;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class ExtractionExecutorMetricsTest {

    private final SimpleMeterRegistry registry = new SimpleMeterRegistry();
    private MediaExtractionExecutor metadataExecutor;
    private MediaExtractionExecutor analysisExecutor;

    @BeforeEach
    void setUp() {
        ExtractionExecutorMetrics metrics = new ExtractionExecutorMetrics(registry);
        metadataExecutor = new MediaExtractionExecutor("test-metadata-", 1, 10);
        analysisExecutor = new MediaExtractionExecutor("test-analysis-", 1, 10);
        metrics.bind(metadataExecutor);
        metrics.bind(analysisExecutor);
        metrics.bind(analysisExecutor);
    }

    @AfterEach
    void tearDown() {
        metadataExecutor.close();
        analysisExecutor.close();
    }

    @Test
    void 실행기가_비어_있으면_배포_대기_지표가_0이다() {
        // when & then
        assertAll(
                () -> assertThat(drainGauge("executor.active")).isZero(),
                () -> assertThat(drainGauge("executor.queued")).isZero()
        );
    }

    @Test
    void 메타데이터_작업이_끝나도_넘겨받은_분석_작업이_남아_있으면_처리_중으로_센다() throws InterruptedException {
        // given
        CountDownLatch release = new CountDownLatch(1);
        CountDownLatch analysisStarted = new CountDownLatch(1);
        CountDownLatch analysisFinished = new CountDownLatch(1);

        // when
        metadataExecutor.execute(() -> analysisExecutor.execute(() -> {
            analysisStarted.countDown();
            await(release);
            analysisFinished.countDown();
        }));
        assertThat(analysisStarted.await(5, TimeUnit.SECONDS)).isTrue();
        assertThat(eventually(() -> metadataExecutor.getActiveCount() == 0)).isTrue();

        // then
        assertThat(drainGauge("executor.active")).isEqualTo(1);
        release.countDown();
        assertThat(analysisFinished.await(5, TimeUnit.SECONDS)).isTrue();
        assertThat(eventually(() -> drainGauge("executor.active") == 0)).isTrue();
    }

    @Test
    void 분석_스레드가_모두_일하면_대기_작업을_두_실행기_합으로_센다() throws InterruptedException {
        // given
        CountDownLatch release = new CountDownLatch(1);
        CountDownLatch started = new CountDownLatch(1);
        analysisExecutor.execute(() -> {
            started.countDown();
            await(release);
        });
        assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();

        // when
        analysisExecutor.execute(() -> { });

        // then
        assertAll(
                () -> assertThat(drainGauge("executor.queued")).isEqualTo(1),
                () -> assertThat(drainGauge("executor.active")).isEqualTo(2),
                () -> assertThat(registry.get("media.extraction.queue.size").gauge().value()).isEqualTo(1),
                () -> assertThat(registry.get("media.extraction.active").gauge().value()).isEqualTo(1)
        );
        release.countDown();
    }

    private double drainGauge(String name) {
        return registry.get(name).tag("name", "mediaExtractionExecutor").gauge().value();
    }

    private static void await(CountDownLatch latch) {
        try {
            latch.await(5, TimeUnit.SECONDS);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
        }
    }

    private static boolean eventually(BooleanSupplier condition) throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (System.nanoTime() < deadline) {
            if (condition.getAsBoolean()) {
                return true;
            }
            Thread.sleep(10);
        }
        return false;
    }
}
