package com.yeogidam.media.extraction.infrastructure;

import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 메타데이터와 분석 실행기를 합친 처리 중, 대기 작업 수를 운영에서도 항상 내보낸다.
 * 배포 스크립트는 executor.active와 executor.queued(name=mediaExtractionExecutor)가 0이 될 때까지 기다린 뒤 이전 컨테이너를 끈다.
 * Spring Boot는 ThreadPoolTaskExecutor 빈에만 이 지표를 자동으로 만들므로, 직접 감싼 두 실행기는 여기서 등록한다.
 * executor.active는 일하는 스레드 수가 아니라 접수부터 끝날 때까지의 작업 수(대기 포함)다.
 * 분석 작업은 메타데이터 작업이 끝나기 전에 접수되므로, 두 단계 사이에서도 0으로 떨어지지 않는다.
 * 태그 name=mediaExtractionExecutor는 단일 실행기 시절 이름을 배포 스크립트와 맞추려고 그대로 쓴다.
 */
public class ExtractionExecutorMetrics {

    private static final String EXECUTOR_TAG = "name";
    private static final String EXECUTOR_NAME = "mediaExtractionExecutor";

    private final Set<MediaExtractionExecutor> executors = ConcurrentHashMap.newKeySet();
    private final AtomicInteger inFlight = new AtomicInteger();

    public ExtractionExecutorMetrics(MeterRegistry registry) {
        Gauge.builder("executor.active", inFlight, AtomicInteger::get)
                .tag(EXECUTOR_TAG, EXECUTOR_NAME).register(registry);
        Gauge.builder("executor.queued", this, ExtractionExecutorMetrics::queueSize)
                .tag(EXECUTOR_TAG, EXECUTOR_NAME).register(registry);
        Gauge.builder("media.extraction.queue.size", this, ExtractionExecutorMetrics::queueSize).register(registry);
        Gauge.builder("media.extraction.active", this, ExtractionExecutorMetrics::activeCount).register(registry);
    }

    public void bind(MediaExtractionExecutor executor) {
        if (executors.add(executor)) {
            executor.setAdmissionObservers(inFlight::incrementAndGet, inFlight::decrementAndGet);
        }
    }

    private double queueSize() {
        return executors.stream().mapToInt(MediaExtractionExecutor::getQueueSize).sum();
    }

    private double activeCount() {
        return executors.stream().mapToInt(MediaExtractionExecutor::getActiveCount).sum();
    }
}
