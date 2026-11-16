package com.yeogidam.media.extraction.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.event.ContextClosedEvent;
import org.springframework.context.support.GenericApplicationContext;
import org.springframework.context.support.DefaultLifecycleProcessor;

class MediaExtractionLifecycleTest {

    @Test
    void 종료_중에도_메타데이터를_분석으로_넘기고_분석까지_마친다() throws Exception {
        // given
        var metadataStarted = new CountDownLatch(1);
        var releaseMetadata = new CountDownLatch(1);
        var analysisStarted = new CountDownLatch(1);
        var releaseAnalysis = new CountDownLatch(1);
        var context = new AnnotationConfigApplicationContext();
        context.registerBean("mediaAnalysisExecutor", MediaExtractionExecutor.class,
                () -> new MediaExtractionExecutor("analysis-", 10, 100));
        context.registerBean("mediaMetadataExecutor", MediaExtractionExecutor.class,
                () -> new MediaExtractionExecutor("metadata-", 8, 100),
                definition -> definition.setDependsOn("mediaAnalysisExecutor"));
        context.registerBean(MediaExtractionLifecycle.class, () -> new MediaExtractionLifecycle(
                context.getBean("mediaMetadataExecutor", MediaExtractionExecutor.class),
                context.getBean("mediaAnalysisExecutor", MediaExtractionExecutor.class)));
        context.refresh();
        context.getBean(DefaultLifecycleProcessor.class).setTimeoutPerShutdownPhase(10);
        var metadata = context.getBean("mediaMetadataExecutor", MediaExtractionExecutor.class);
        var analysis = context.getBean("mediaAnalysisExecutor", MediaExtractionExecutor.class);
        metadata.execute(() -> {
            waitForRelease(metadataStarted, releaseMetadata);
            analysis.execute(() -> waitForRelease(analysisStarted, releaseAnalysis));
        });
        CompletableFuture<Void> closing = null;
        try {
            assertThat(metadataStarted.await(5, TimeUnit.SECONDS)).isTrue();

            // when
            closing = CompletableFuture.runAsync(context::close);
            awaitStopping(metadata);
            Thread.sleep(50); // Spring의 단계 종료 대기 상한이 지난 뒤에도 인계를 허용해야 한다.

            // then
            assertThat(analysis.isRunning()).isTrue();
            releaseMetadata.countDown();
            assertThat(analysisStarted.await(5, TimeUnit.SECONDS)).isTrue();
            assertThat(closing.isDone()).isFalse();
        } finally {
            releaseMetadata.countDown();
            releaseAnalysis.countDown();
            if (closing != null) {
                closing.get(5, TimeUnit.SECONDS);
            }
            context.close();
        }
        assertThat(analysis.getActiveCount()).isZero();
    }

    @Test
    void 정상_종료하면_받은_작업이_분석까지_끝난_뒤에_종료_완료를_알린다() throws Exception {
        // given: 메타데이터 작업 A가 캡션을 저장하고 분석으로 넘기려던 참에 종료가 시작된다.
        var metadata = new MediaExtractionExecutor("metadata-", 1, 10);
        var analysis = new MediaExtractionExecutor("analysis-", 1, 10);
        var lifecycle = new MediaExtractionLifecycle(metadata, analysis);
        var metadataStarted = new CountDownLatch(1);
        var releaseMetadata = new CountDownLatch(1);
        var analysisStarted = new CountDownLatch(1);
        var releaseAnalysis = new CountDownLatch(1);
        var analysisFinished = new CountDownLatch(1);
        var stopped = new CountDownLatch(1);
        metadata.execute(() -> {
            waitForRelease(metadataStarted, releaseMetadata);
            analysis.execute(() -> {
                waitForRelease(analysisStarted, releaseAnalysis);
                analysisFinished.countDown();
            });
        });
        try {
            assertThat(metadataStarted.await(5, TimeUnit.SECONDS)).isTrue();

            // when
            lifecycle.onApplicationEvent(new ContextClosedEvent(new GenericApplicationContext()));
            lifecycle.stop(stopped::countDown);
            releaseMetadata.countDown();

            // then: A는 분석으로 넘어가고, 분석이 끝나기 전에는 종료 완료를 알리지 않는다.
            assertThat(analysisStarted.await(5, TimeUnit.SECONDS)).isTrue();
            assertThat(stopped.await(50, TimeUnit.MILLISECONDS)).isFalse();
            releaseAnalysis.countDown();
            assertThat(stopped.await(5, TimeUnit.SECONDS)).isTrue();
            assertThat(analysisFinished.getCount()).isZero();
        } finally {
            releaseMetadata.countDown();
            releaseAnalysis.countDown();
            lifecycle.close();
        }
    }

    private void awaitStopping(MediaExtractionExecutor executor) throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (executor.isRunning() && System.nanoTime() < deadline) {
            Thread.sleep(1);
        }
        assertThat(executor.isRunning()).isFalse();
    }

    private void waitForRelease(CountDownLatch started, CountDownLatch release) {
        started.countDown();
        try {
            if (!release.await(5, TimeUnit.SECONDS)) {
                throw new IllegalStateException("테스트 종료 신호가 없습니다.");
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(exception);
        }
    }
}
