package com.yeogidam.media.extraction.infrastructure;

import java.util.Objects;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.RejectedExecutionException;
import org.springframework.core.task.AsyncTaskExecutor;
import org.springframework.core.task.TaskDecorator;
import org.springframework.core.task.TaskRejectedException;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

/** 고정 코어 플랫폼 풀의 접수, 계측과 단계별 종료를 관리한다. */
public final class MediaExtractionExecutor implements AsyncTaskExecutor, AutoCloseable {

    private final Object monitor = new Object();
    private final CompletableFuture<Void> drained = new CompletableFuture<>();
    private final ThreadPoolTaskExecutor executor;

    private volatile TaskDecorator taskDecorator = task -> task;
    private volatile Runnable rejectionObserver = () -> { };
    private volatile Runnable admissionObserver = () -> { };
    private volatile Runnable completionObserver = () -> { };
    private boolean accepting = true;
    private int acceptedCount;
    private int activeCount;

    public MediaExtractionExecutor(int coreSize, int queueCapacity) {
        this("media-extraction-", coreSize, queueCapacity);
    }

    public MediaExtractionExecutor(
            String threadNamePrefix,
            int coreSize,
            int queueCapacity
    ) {
        if (coreSize < 1 || queueCapacity < 0) {
            throw new IllegalArgumentException("코어 스레드 수는 1 이상, 대기 허용량은 0 이상이어야 합니다.");
        }
        this.executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(coreSize);
        executor.setMaxPoolSize(coreSize);
        executor.setQueueCapacity(queueCapacity);
        executor.setThreadNamePrefix(threadNamePrefix);
        executor.setPrestartAllCoreThreads(true);
        executor.setAllowCoreThreadTimeOut(false);
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.initialize();
    }

    @Override
    public void execute(Runnable task) {
        Runnable observedTask = taskDecorator.decorate(Objects.requireNonNull(task));
        synchronized (monitor) {
            if (!accepting) {
                throw rejected();
            }
            acceptedCount++;
            admissionObserver.run();
            try {
                executor.execute(() -> runTask(observedTask));
            } catch (RuntimeException | Error exception) {
                acceptedCount--;
                completionObserver.run();
                if (exception instanceof RejectedExecutionException) {
                    rejectionObserver.run();
                }
                throw exception;
            }
        }
    }

    private TaskRejectedException rejected() {
        rejectionObserver.run();
        return new TaskRejectedException("추출 실행기가 종료 중이거나 실행과 대기 한도를 초과했습니다.");
    }

    private void runTask(Runnable task) {
        synchronized (monitor) {
            activeCount++;
        }
        try {
            task.run();
        } finally {
            completeTask();
        }
    }

    private void completeTask() {
        synchronized (monitor) {
            activeCount--;
            acceptedCount--;
            completionObserver.run();
        }
        completeDrainIfIdle();
    }

    public void stop() {
        synchronized (monitor) {
            accepting = false;
            executor.getThreadPoolExecutor().shutdown();
        }
        completeDrainIfIdle();
    }

    private void completeDrainIfIdle() {
        synchronized (monitor) {
            if (accepting || acceptedCount != 0) {
                return;
            }
        }
        drained.complete(null);
    }

    public void stop(Runnable callback) {
        stop();
        drained.thenRun(callback);
    }

    public boolean isRunning() {
        synchronized (monitor) {
            return accepting;
        }
    }

    @Override
    public void close() {
        stop();
        drained.join();
        executor.getThreadPoolExecutor().close();
    }

    public void setTaskDecorator(TaskDecorator taskDecorator) {
        this.taskDecorator = Objects.requireNonNull(taskDecorator);
    }

    public void setRejectionObserver(Runnable rejectionObserver) {
        this.rejectionObserver = Objects.requireNonNull(rejectionObserver);
    }

    public void setAdmissionObservers(Runnable admissionObserver, Runnable completionObserver) {
        this.admissionObserver = Objects.requireNonNull(admissionObserver);
        this.completionObserver = Objects.requireNonNull(completionObserver);
    }

    public int getActiveCount() {
        synchronized (monitor) {
            return activeCount;
        }
    }

    public int getQueueSize() {
        return executor.getQueueSize();
    }

    public int getMaxConcurrency() {
        return executor.getMaxPoolSize();
    }

    public int getQueueCapacity() {
        return executor.getQueueCapacity();
    }

    public int getCorePoolSize() {
        return executor.getCorePoolSize();
    }

    public int getMaxPoolSize() {
        return executor.getMaxPoolSize();
    }

    public int getPoolSize() {
        return executor.getPoolSize();
    }
}
