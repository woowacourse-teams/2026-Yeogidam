package com.yeogidam.media.extraction.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertAll;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.core.task.TaskRejectedException;

class MediaExtractionExecutorTest {

    @Test
    void 플랫폼_코어_스레드를_재사용한다() throws Exception {
        // given
        try (var executor = new MediaExtractionExecutor(1, 1)) {
            // when
            Thread first = executor.submit(Thread::currentThread).get(5, TimeUnit.SECONDS);
            Thread second = executor.submit(Thread::currentThread).get(5, TimeUnit.SECONDS);

            // then
            assertAll(
                    () -> assertThat(first.isVirtual()).isFalse(),
                    () -> assertThat(second.isVirtual()).isFalse(),
                    () -> assertThat(second).isSameAs(first),
                    () -> assertThat(first.getName()).startsWith("media-extraction-")
            );
        }
    }

    @ParameterizedTest
    @ValueSource(ints = {1, 3})
    void 시작할_때_코어_스레드를_만들고_작업_후에도_유지한다(int coreSize) throws Exception {
        // given
        try (var executor = new MediaExtractionExecutor(coreSize, 100)) {
            assertThat(executor.getPoolSize()).isEqualTo(coreSize);

            // when
            boolean virtual = executor.submit(() -> Thread.currentThread().isVirtual()).get(5, TimeUnit.SECONDS);

            // then
            assertAll(
                    () -> assertThat(virtual).isFalse(),
                    () -> assertThat(executor.getCorePoolSize()).isEqualTo(coreSize),
                    () -> assertThat(executor.getMaxPoolSize()).isEqualTo(coreSize),
                    () -> assertThat(executor.getPoolSize()).isEqualTo(coreSize)
            );
        }
    }

    @ParameterizedTest
    @ValueSource(ints = {1, 3})
    void 실행_한도를_넘은_작업은_호출자를_막지_않고_대기시킨다(int concurrency) throws Exception {
        // given
        var started = new CountDownLatch(concurrency);
        var release = new CountDownLatch(1);
        var queuedStarted = new CountDownLatch(1);
        try (var executor = new MediaExtractionExecutor(concurrency, 1)) {
            try {
                for (int index = 0; index < concurrency; index++) {
                    var workerStarted = new CountDownLatch(1);
                    executor.execute(() -> {
                        workerStarted.countDown();
                        awaitRelease(started, release);
                    });
                    assertThat(workerStarted.await(5, TimeUnit.SECONDS)).isTrue();
                }
                assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();

                // when
                CompletableFuture.runAsync(() -> executor.execute(queuedStarted::countDown))
                        .get(5, TimeUnit.SECONDS);

                // then
                assertAll(
                        () -> assertThat(executor.getActiveCount()).isEqualTo(concurrency),
                        () -> assertThat(executor.getQueueSize()).isEqualTo(1),
                        () -> assertThat(queuedStarted.getCount()).isEqualTo(1)
                );
            } finally {
                release.countDown();
            }
            assertThat(queuedStarted.await(5, TimeUnit.SECONDS)).isTrue();
        }
    }

    @Test
    void 실행과_대기_한도를_넘으면_즉시_거절한다() throws Exception {
        // given
        var started = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        try (var executor = new MediaExtractionExecutor(1, 1)) {
            try {
                executor.execute(() -> awaitRelease(started, release));
                assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
                executor.execute(() -> { });

                // when & then
                assertThatThrownBy(() -> executor.execute(() -> { }))
                        .isInstanceOf(TaskRejectedException.class);
            } finally {
                release.countDown();
            }
        }
    }

    @Test
    void 대기_허용량이_0이면_실행_한도에서_즉시_거절한다() throws Exception {
        // given
        var started = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        try (var executor = new MediaExtractionExecutor(1, 0)) {
            try {
                startWithoutQueue(executor, () -> awaitRelease(started, release));
                assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();

                // when & then
                assertThatThrownBy(() -> executor.execute(() -> { }))
                        .isInstanceOf(TaskRejectedException.class);
            } finally {
                release.countDown();
            }
        }
    }

    @Test
    void 작업이_실패해도_다음_대기_작업을_실행한다() throws Exception {
        // given
        var started = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        var completed = new CountDownLatch(1);
        try (var executor = new MediaExtractionExecutor(1, 1)) {
            try {
                executor.submit(() -> {
                    awaitRelease(started, release);
                    throw new IllegalStateException("추출 실패");
                });
                assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
                executor.execute(completed::countDown);

                // when
                release.countDown();

                // then
                assertThat(completed.await(5, TimeUnit.SECONDS)).isTrue();
            } finally {
                release.countDown();
            }
        }
    }

    @Test
    void 종료할_때_접수한_대기_작업까지_마친_뒤_콜백을_호출한다() throws Exception {
        // given
        var started = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        var completed = new CountDownLatch(1);
        var stopped = new CountDownLatch(1);
        try (var executor = new MediaExtractionExecutor(1, 1)) {
            try {
                executor.execute(() -> awaitRelease(started, release));
                assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
                executor.execute(completed::countDown);

                // when
                executor.stop(stopped::countDown);

                // then
                assertAll(
                        () -> assertThat(stopped.getCount()).isEqualTo(1),
                        () -> assertThatThrownBy(() -> executor.execute(() -> { }))
                                .isInstanceOf(TaskRejectedException.class)
                );
            } finally {
                release.countDown();
            }
            assertThat(stopped.await(5, TimeUnit.SECONDS)).isTrue();
            assertAll(
                    () -> assertThat(completed.getCount()).isZero(),
                    () -> assertThat(executor.getActiveCount()).isZero(),
                    () -> assertThat(executor.getQueueSize()).isZero()
            );
        }
    }

    private void awaitRelease(CountDownLatch started, CountDownLatch release) {
        started.countDown();
        try {
            if (!release.await(5, TimeUnit.SECONDS)) {
                throw new IllegalStateException("테스트 작업의 종료 신호가 없습니다.");
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(exception);
        }
    }

    private void startWithoutQueue(MediaExtractionExecutor executor, Runnable task) throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (System.nanoTime() < deadline) {
            try {
                executor.execute(task);
                return;
            } catch (TaskRejectedException exception) {
                // 큐가 없으므로 미리 생성한 코어 스레드가 작업 인계를 기다릴 때까지 대기한다.
                Thread.sleep(1);
            }
        }
        throw new AssertionError("코어 스레드가 작업 인계를 기다리지 않습니다.");
    }
}
