package com.yeogidam.support.fake;

import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.core.task.TaskExecutor;
import org.springframework.core.task.TaskRejectedException;

/**
 * 접수된 작업 수를 기록하고 모든 작업이 끝날 때까지 기다려 테스트 간 비동기 작업이 섞이지 않게 한다.
 */
public final class FakeExtractionRetryExecutor implements TaskExecutor, AutoCloseable {

    private static final int TIMEOUT_SECONDS = 10;

    private final ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();
    private final List<CompletableFuture<Void>> tasks = new CopyOnWriteArrayList<>();
    private final AtomicBoolean rejectNextTask = new AtomicBoolean();

    @Override
    public void execute(Runnable task) {
        if (rejectNextTask.getAndSet(false)) {
            throw new TaskRejectedException("테스트 실행기의 접수를 거절합니다.");
        }
        tasks.add(CompletableFuture.runAsync(task, executor));
    }

    public int countSubmittedTasks() {
        return tasks.size();
    }

    public void awaitCompletion() throws Exception {
        for (CompletableFuture<Void> task : tasks) {
            task.get(TIMEOUT_SECONDS, TimeUnit.SECONDS);
        }
    }

    public void reset() {
        tasks.clear();
        rejectNextTask.set(false);
    }

    public void rejectNextTask() {
        rejectNextTask.set(true);
    }

    @Override
    public void close() {
        executor.close();
    }
}
