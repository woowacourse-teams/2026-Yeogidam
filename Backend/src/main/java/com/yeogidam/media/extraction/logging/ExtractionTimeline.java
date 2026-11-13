package com.yeogidam.media.extraction.logging;

import com.yeogidam.media.extraction.domain.ExtractionFailureReason;
import java.time.Duration;
import java.util.EnumMap;
import java.util.Map;
import java.util.function.Supplier;
import lombok.extern.slf4j.Slf4j;
import org.slf4j.spi.LoggingEventBuilder;

/**
 * 추출 작업 하나가 큐에 들어간 때부터 끝날 때까지 단계마다 INFO 로그를 한 줄씩 남긴다(#537).
 * 단계 번호는 #537의 시간표를 따른다. T1 큐 등록, T2 작업 시작, T5 캡션과 썸네일 커밋, T8 완료나 실패는 줄을 하나씩 남기고,
 * T3 인스타그램 페이지 읽기 끝과 T4 썸네일 저장 끝은 T5 줄에 구간 길이로 싣는다.
 * T5 뒤의 Gemini 분석과 지도 검색, 장소 페이지 읽기는 단서와 장소 수만큼 반복되고 서로 섞여서 한 시각으로 찍을 수 없으므로,
 * 종류마다 걸린 시간의 합과 호출 수를 모아 끝 줄에 싣는다.
 * 운영에서는 logstash JSON의 최상위 키(extractionStage, queueWaitMs 등)를 CloudWatch Logs Insights에서 바로 집계하고,
 * 단계가 일어난 시각은 줄마다 붙는 @timestamp로 본다. 구간 길이는 벽시계 대신 System.nanoTime() 차이로 잰다.
 * 끝에 요약 한 줄만 남기지 않고 단계마다 남기는 까닭은, 인스타그램 페이지 읽기에 시간 제한이 없어 멈춘 작업도 어디서 멈췄는지 보여야 하기 때문이다.
 * 작업을 시작한 뒤의 시각은 추출 스레드의 ThreadLocal에 두고, 작업이 끝나면 {@link ExtractionTaskDecorator}가 비운다.
 * 추출 스레드 밖(테스트, 다른 기능)에서 부르면 아무것도 남기지 않는다.
 */
@Slf4j
public final class ExtractionTimeline {

    private static final String STAGE = "extractionStage";
    private static final String QUEUE_WAIT_MS = "queueWaitMs";
    private static final String FIRST_STAGE_MS = "firstStageMs";
    private static final ThreadLocal<ExtractionTimeline> CURRENT = new ThreadLocal<>();

    private final long queuedAt;
    private final long startedAt;
    private final Long requestStartedAt;
    private final Map<ExternalCall, CallTotal> callTotals = new EnumMap<>(ExternalCall.class);
    private Long instagramReadAt;
    private Long thumbnailStoredAt;
    private Long metadataStoredAt;
    private boolean mediaAnalyzed;

    private ExtractionTimeline(
            long queuedAt,
            long startedAt,
            Long requestStartedAt
    ) {
        this.queuedAt = queuedAt;
        this.startedAt = startedAt;
        this.requestStartedAt = requestStartedAt;
        for (ExternalCall call : ExternalCall.values()) {
            callTotals.put(call, new CallTotal());
        }
    }

    /**
     * T1. 요청 스레드가 작업을 큐에 넣기 직전에 부른다.
     * queueSize는 큐에 넣으려는 작업보다 먼저 기다리는 작업 수이고, activeCount는 큐에 넣을 때 일하고 있는 추출 스레드 수다.
     */
    static long queued(int queueSize, int activeCount) {
        log.atInfo()
                .addKeyValue(STAGE, Stage.QUEUED.name())
                .addKeyValue("queueSize", queueSize)
                .addKeyValue("activeCount", activeCount)
                .log("[추출] 큐 등록 queueSize={} activeCount={}", queueSize, activeCount);
        return System.nanoTime();
    }

    /** T2. 추출 스레드가 큐에서 작업을 꺼낸 직후에 부른다. */
    static void started(long queuedAt, Long requestStartedAt) {
        ExtractionTimeline timeline = new ExtractionTimeline(queuedAt, System.nanoTime(), requestStartedAt);
        CURRENT.set(timeline);
        long queueWaitMs = timeline.queueWaitMs();
        log.atInfo()
                .addKeyValue(STAGE, Stage.STARTED.name())
                .addKeyValue(QUEUE_WAIT_MS, queueWaitMs)
                .log("[추출] 작업 시작 queueWaitMs={}", queueWaitMs);
    }

    static void clear() {
        CURRENT.remove();
    }

    /** T3. 인스타그램 게시물 페이지를 읽은 직후에 부른다. */
    public static void instagramRead() {
        ExtractionTimeline timeline = CURRENT.get();
        if (timeline != null) {
            timeline.instagramReadAt = System.nanoTime();
        }
    }

    /** T4. 게시물 썸네일을 내려받아 S3에 저장한 직후에 부른다. */
    public static void thumbnailStored() {
        ExtractionTimeline timeline = CURRENT.get();
        if (timeline != null) {
            timeline.thumbnailStoredAt = System.nanoTime();
        }
    }

    /**
     * T5. 캡션과 썸네일을 커밋한 직후에 부르며, 앱의 게시물 카드는 이때부터 채워진다.
     * requestToMetadataMs는 요청 필터의 계측 시작부터 저장 완료까지이며, 앱의 조회나 화면 표시 시간은 포함하지 않는다.
     * sinceQueuedMs와 요청 로그의 durationMs는 큐 등록 이후 요청 종료까지 겹치므로 더하지 않는다.
     */
    public static void metadataStored() {
        ExtractionTimeline timeline = CURRENT.get();
        if (timeline == null) {
            return;
        }
        timeline.metadataStoredAt = System.nanoTime();
        long firstStageMs = timeline.firstStageMs();
        long sinceQueuedMs = toMillis(timeline.metadataStoredAt - timeline.queuedAt);
        timeline.addFirstStage(log.atInfo().addKeyValue(STAGE, Stage.METADATA_STORED.name()))
                .addKeyValue("sinceQueuedMs", sinceQueuedMs)
                .log("[추출] 캡션과 썸네일 저장 firstStageMs={} sinceQueuedMs={}", firstStageMs, sinceQueuedMs);
    }

    /** T5 뒤의 외부 호출 하나를 감싸 걸린 시간을 종류별 합에 더한다. 호출이 예외로 끝나도 걸린 시간은 더한다. */
    public static <T> T measure(ExternalCall call, Supplier<T> action) {
        ExtractionTimeline timeline = CURRENT.get();
        if (timeline == null) {
            return action.get();
        }
        long callStartedAt = System.nanoTime();
        try {
            return action.get();
        } finally {
            timeline.callTotals.get(call).add(System.nanoTime() - callStartedAt);
        }
    }

    /** 캡션만으로 장소를 찾지 못해 영상과 사진까지 분석하기 시작할 때 부른다. */
    public static void mediaAnalysisStarted() {
        ExtractionTimeline timeline = CURRENT.get();
        if (timeline != null) {
            timeline.mediaAnalyzed = true;
        }
    }

    /** T8. 장소 연결까지 커밋한 직후에 부른다. */
    public static void succeeded() {
        finish(Stage.SUCCEEDED, null);
    }

    /** T8. 실패 상태를 저장한 직후에 부른다. */
    public static void failed(ExtractionFailureReason failureReason) {
        finish(Stage.FAILED, failureReason);
    }

    // 끝 줄에는 앞 단계의 구간 길이와 외부 호출 합계도 함께 실어서, 끝 줄만 골라도 작업마다 모든 구간을 한 번에 집계할 수 있게 한다.
    private static void finish(Stage stage, ExtractionFailureReason failureReason) {
        ExtractionTimeline timeline = CURRENT.get();
        if (timeline == null) {
            return;
        }
        long finishedAt = System.nanoTime();
        long totalMs = toMillis(finishedAt - timeline.queuedAt);
        LoggingEventBuilder event = log.atInfo()
                .addKeyValue(STAGE, stage.name())
                .addKeyValue(QUEUE_WAIT_MS, timeline.queueWaitMs())
                .addKeyValue("totalMs", totalMs);
        event = timeline.addFirstStage(event);
        if (timeline.metadataStoredAt != null) {
            event = event.addKeyValue("secondStageMs", toMillis(finishedAt - timeline.metadataStoredAt));
        }
        event = timeline.addCallTotals(event)
                .addKeyValue("mediaAnalyzed", timeline.mediaAnalyzed);
        if (failureReason != null) {
            event = event.addKeyValue("failureReason", failureReason.name());
        }
        event.log("[추출] 작업 끝 {} totalMs={}", stage, totalMs);
    }

    // 실패한 작업은 단계 중간에 끝나므로, 지나간 단계의 길이만 싣는다.
    private LoggingEventBuilder addFirstStage(LoggingEventBuilder event) {
        if (instagramReadAt != null) {
            event = event.addKeyValue("instagramReadMs", toMillis(instagramReadAt - startedAt));
        }
        if (instagramReadAt != null && thumbnailStoredAt != null) {
            event = event.addKeyValue("thumbnailStoreMs", toMillis(thumbnailStoredAt - instagramReadAt));
        }
        if (metadataStoredAt != null) {
            event = event.addKeyValue(FIRST_STAGE_MS, firstStageMs());
        }
        return addRequestToMetadata(event);
    }

    private LoggingEventBuilder addRequestToMetadata(LoggingEventBuilder event) {
        if (requestStartedAt == null || metadataStoredAt == null) {
            return event;
        }
        return event.addKeyValue("requestToMetadataMs", toMillis(metadataStoredAt - requestStartedAt));
    }

    private LoggingEventBuilder addCallTotals(LoggingEventBuilder event) {
        for (Map.Entry<ExternalCall, CallTotal> entry : callTotals.entrySet()) {
            ExternalCall call = entry.getKey();
            CallTotal total = entry.getValue();
            event = event.addKeyValue(call.keyPrefix + "Ms", toMillis(total.nanos))
                    .addKeyValue(call.keyPrefix + "Calls", total.calls);
        }
        return event;
    }

    private long queueWaitMs() {
        return toMillis(startedAt - queuedAt);
    }

    private long firstStageMs() {
        return toMillis(metadataStoredAt - startedAt);
    }

    private static long toMillis(long nanos) {
        return Duration.ofNanos(nanos).toMillis();
    }

    /** T5 뒤에 걸린 시간을 모아 재는 외부 호출 종류이며, 끝 줄에 keyPrefix 뒤로 Ms와 Calls를 붙인 키로 실린다. */
    public enum ExternalCall {
        // 캡션 분석과 영상 분석(영상 다운로드와 Gemini 업로드 포함)
        GEMINI("gemini"),
        // 카카오 키워드 검색, 해외와 국내 보조 Google Places 검색
        PLACE_SEARCH("placeSearch"),
        // 카카오 장소 페이지에서 대표 사진을 읽어 S3에 저장
        PLACE_PAGE("placePage");

        private final String keyPrefix;

        ExternalCall(String keyPrefix) {
            this.keyPrefix = keyPrefix;
        }
    }

    private static final class CallTotal {

        private long nanos;
        private int calls;

        private void add(long elapsedNanos) {
            nanos += elapsedNanos;
            calls++;
        }
    }

    private enum Stage {
        QUEUED,
        STARTED,
        METADATA_STORED,
        SUCCEEDED,
        FAILED
    }
}
