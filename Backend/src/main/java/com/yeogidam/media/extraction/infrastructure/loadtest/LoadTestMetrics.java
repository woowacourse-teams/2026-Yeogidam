package com.yeogidam.media.extraction.infrastructure.loadtest;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import java.time.Duration;
import java.util.concurrent.RejectedExecutionHandler;
import java.util.concurrent.ThreadPoolExecutor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

@Slf4j
public class LoadTestMetrics {

    private final MeterRegistry registry;
    private final Timer queueWait;
    private final Timer execution;
    private final Counter dedicatedQueueWaitSamples;
    private final Counter succeeded;
    private final Counter failed;
    private final Counter rejected;
    private final ThreadLocal<Long> currentQueueWaitNanos = new ThreadLocal<>();

    public LoadTestMetrics(MeterRegistry registry) {
        this.registry = registry;
        queueWait = registry.timer("media.extraction.queue.wait");
        execution = registry.timer("media.extraction.execution");
        dedicatedQueueWaitSamples = registry.counter("media.extraction.queue.wait.dedicated.samples");
        succeeded = registry.counter("media.extraction.succeeded");
        failed = registry.counter("media.extraction.failed");
        rejected = registry.counter("media.extraction.rejected");
    }

    public void bindExecutor(ThreadPoolTaskExecutor executor) {
        Gauge.builder("media.extraction.queue.size", executor, ThreadPoolTaskExecutor::getQueueSize).register(registry);
        Gauge.builder("media.extraction.active", executor, ThreadPoolTaskExecutor::getActiveCount).register(registry);
        ThreadPoolExecutor pool = executor.getThreadPoolExecutor();
        RejectedExecutionHandler rejectionHandler = pool.getRejectedExecutionHandler();
        pool.setRejectedExecutionHandler((task, rejectedPool) -> {
            rejected.increment();
            rejectionHandler.rejectedExecution(task, rejectedPool);
        });
    }

    // ExtractionConfig가 단계 로그 데코레이터와 합쳐 실행기에 붙인다.
    public Runnable observeTask(Runnable task) {
        long submittedAt = System.nanoTime();
        return () -> execute(task, submittedAt);
    }

    private void execute(Runnable task, long submittedAt) {
        long startedAt = System.nanoTime();
        long queueWaitNanos = startedAt - submittedAt;
        queueWait.record(Duration.ofNanos(queueWaitNanos));
        currentQueueWaitNanos.set(queueWaitNanos);
        try {
            task.run();
        } finally {
            currentQueueWaitNanos.remove();
            execution.record(Duration.ofNanos(System.nanoTime() - startedAt));
        }
    }

    void logDedicatedQueueWait(String shortcode) {
        Long queueWaitNanos = currentQueueWaitNanos.get();
        if (queueWaitNanos != null) {
            log.info("LOAD_TEST_QUEUE_WAIT shortcode={} queueNs={}", shortcode, queueWaitNanos);
            dedicatedQueueWaitSamples.increment();
        }
    }

    public void recordSucceeded() {
        succeeded.increment();
    }

    public void recordFailed() {
        failed.increment();
    }

    public void recordExternal(String service, boolean fake, long startedAt, String outcome) {
        recordExternal(service, fake, startedAt, outcome, -1);
    }

    public void recordExternal(
            String service,
            boolean fake,
            long startedAt,
            String outcome,
            long bodyBytes
    ) {
        double milliseconds = (System.nanoTime() - startedAt) / 1_000_000.0;
        String route = "real";
        if (fake) {
            route = "fake";
        }
        Timer.builder("media.extraction.external")
                .tags("service", service, "route", route, "outcome", outcome)
                .register(registry)
                .record(Duration.ofNanos((long) (milliseconds * 1_000_000)));
        log.info("LOAD_TEST_EXTERNAL service={} route={} durationMs={} outcome={} bodyBytes={}",
                service, route, milliseconds, outcome, bodyBytes);
    }
}
