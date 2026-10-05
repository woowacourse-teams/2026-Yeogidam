package com.yeogidam.support.fake;

import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.springframework.core.task.TaskExecutor;

/**
 * 접수된 작업 수를 기록하고 모든 작업이 끝날 때까지 기다려 테스트 간 비동기 작업이 섞이지 않게 한다.
 */
public final class FakeExtractionRetryExecutor implements TaskExecutor, AutoCloseable {

    private static final int TIMEOUT_SECONDS = 10;

    private final ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();
    private final List<CompletableFuture<Void>> tasks = new CopyOnWriteArrayList<>();

    @Override
    public void execute(Runnable task) {
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
    }

    @Override
    public void close() {
        executor.close();
    }
}
