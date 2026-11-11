package com.yeogidam.media.extraction.service;

import com.yeogidam.media.extraction.domain.ExtractionFailureReason;
import com.yeogidam.media.extraction.domain.ExtractionReport;
import com.yeogidam.media.extraction.exception.ExtractionFailedException;
import com.yeogidam.media.instagram.domain.InstagramUrl;
import com.yeogidam.media.instagram.exception.InstagramContentUnavailableException;
import com.yeogidam.media.instagram.repository.InstagramMediaDao;
import com.yeogidam.media.share.repository.SharedMediaDao;
import java.net.SocketException;
import java.net.SocketTimeoutException;
import java.net.UnknownHostException;
import java.net.http.HttpTimeoutException;
import java.time.Clock;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.slf4j.event.Level;
import org.springframework.core.env.Environment;
import org.springframework.core.task.TaskExecutor;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;
import tools.jackson.core.JacksonException;

@Slf4j
@Service
public class MediaExtractionDispatcher {

    private final MediaExtractionPipeline mediaExtractionPipeline;
    private final TaskExecutor mediaExtractionExecutor;
    private final InstagramMediaDao instagramMediaDao;
    private final SharedMediaDao sharedMediaDao;
    private final TransactionTemplate failureTransactionTemplate;
    private final Clock clock;
    private final Environment environment;

    public MediaExtractionDispatcher(
            MediaExtractionPipeline mediaExtractionPipeline,
            TaskExecutor mediaExtractionExecutor,
            InstagramMediaDao instagramMediaDao,
            SharedMediaDao sharedMediaDao,
            PlatformTransactionManager transactionManager,
            Clock clock,
            Environment environment
    ) {
        this.mediaExtractionPipeline = mediaExtractionPipeline;
        this.mediaExtractionExecutor = mediaExtractionExecutor;
        this.instagramMediaDao = instagramMediaDao;
        this.sharedMediaDao = sharedMediaDao;
        this.failureTransactionTemplate = new TransactionTemplate(transactionManager);
        this.failureTransactionTemplate.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.clock = clock;
        this.environment = environment;
    }

    public void dispatchAfterCommit(Long mediaId, InstagramUrl instagramUrl) {
        Instant startedAt = clock.instant();
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                try {
                    mediaExtractionExecutor.execute(() -> extract(startedAt, mediaId, instagramUrl));
                } catch (RuntimeException exception) {
                    recordFailure(createReport(startedAt, mediaId, instagramUrl), exception);
                }
            }
        });
    }

    private void extract(
            Instant startedAt,
            Long mediaId,
            InstagramUrl instagramUrl
    ) {
        extract(createReport(startedAt, mediaId, instagramUrl), mediaId, instagramUrl);
    }

    private void extract(
            ExtractionReport report,
            Long mediaId,
            InstagramUrl url
    ) {
        try {
            mediaExtractionPipeline.extract(mediaId, url, report);
        } catch (RuntimeException exception) {
            boolean interrupted = hasInterruptedCause(exception);
            if (interrupted) {
                Thread.interrupted();
            }
            try {
                recordFailure(report, exception);
            } finally {
                if (interrupted) {
                    Thread.currentThread().interrupt();
                }
            }
        }
    }

    private ExtractionFailureReason failureReasonFor(RuntimeException exception) {
        if (hasInterruptedCause(exception)) {
            return ExtractionFailureReason.PROCESSING_FAILED;
        }
        if (exception instanceof InstagramContentUnavailableException) {
            return ExtractionFailureReason.CONTENT_UNAVAILABLE;
        }
        if (exception instanceof ExtractionFailedException extractionFailedException) {
            return extractionFailedException.reason();
        }
        return ExtractionFailureReason.UNEXPECTED;
    }

    private boolean hasInterruptedCause(Throwable exception) {
        Throwable cause = exception;
        while (cause != null) {
            if (cause instanceof InterruptedException) {
                return true;
            }
            cause = cause.getCause();
        }
        return false;
    }

    private void recordFailure(ExtractionReport report, RuntimeException error) {
        ExtractionFailureReason reason = failureReasonFor(error);
        if (!markExtractionFailed(report, reason)) {
            log.atLevel(failureLogLevel(error))
                    .addKeyValue("error", describeSafely(error))
                    .log("분석 실패 상태 저장 미확인. media_id={}, started_at={}, failure_reason={}, failure_stage={}",
                            report.mediaId(), report.startedAt(), reason, report.failureStage());
            return;
        }
        logFailure(report, reason, error);
    }

    private boolean markExtractionFailed(ExtractionReport report, ExtractionFailureReason failureReason) {
        try {
            return Boolean.TRUE.equals(failureTransactionTemplate.execute(status -> {
                if (!instagramMediaDao.failExtractionIfInProgress(report.mediaId(), failureReason)) {
                    return false;
                }
                sharedMediaDao.updatePendingExtractions(report.mediaId());
                return true;
            }));
        } catch (RuntimeException exception) {
            log.atError()
                    .addKeyValue("error", describeSafely(exception))
                    .log("실패 상태 저장 오류. media_id={}, started_at={}", report.mediaId(), report.startedAt());
            return false;
        }
    }

    private ExtractionReport createReport(
            Instant startedAt,
            Long mediaId,
            InstagramUrl url
    ) {
        return new ExtractionReport(mediaId, startedAt, url.getSharedUrl(), environmentName());
    }

    private void logFailure(
            ExtractionReport report,
            ExtractionFailureReason reason,
            RuntimeException error
    ) {
        try {
            Map<String, Object> fields = report.toFailureLogFields(reason, describe(error, 0));
            log.atLevel(failureLogLevel(error))
                    .addKeyValue("type", "PLACE_EXTRACTION_FAILED")
                    .addKeyValue("version", 1)
                    .addKeyValue("report", fields)
                    .log("장소 추출 실패. media_id={}, started_at={}, failure_reason={}, failure_stage={}",
                            report.mediaId(), report.startedAt(), reason, report.failureStage());
        } catch (RuntimeException exception) {
            log.error("실패 로그 생성 오류. media_id={}, error_type={}",
                    report.mediaId(), exception.getClass().getSimpleName());
        }
    }

    private Map<String, Object> describe(Throwable error, int depth) {
        if (error == null || depth >= 6) {
            return null;
        }
        Map<String, Object> description = new LinkedHashMap<>();
        description.put("type", error.getClass().getSimpleName());
        description.put("message", error.getMessage());
        if (error instanceof RestClientResponseException responseException) {
            description.put("http_status", responseException.getStatusCode().value());
        }
        description.put("cause", describe(error.getCause(), depth + 1));
        return description;
    }

    private Level failureLogLevel(Throwable error) {
        if (isExpectedFailure(error)) {
            return Level.WARN;
        }
        return Level.ERROR;
    }

    private boolean isExpectedFailure(Throwable error) {
        if (error == null) {
            return true;
        }
        if (error instanceof RestClientException) {
            return isExpectedHttpCause(error.getCause());
        }
        if (error instanceof ExtractionFailedException || error instanceof InstagramContentUnavailableException
                || error instanceof JacksonException || error instanceof IllegalArgumentException) {
            return isExpectedFailure(error.getCause());
        }
        return false;
    }

    private boolean isExpectedHttpCause(Throwable error) {
        if (error instanceof HttpMessageNotReadableException) {
            return isExpectedHttpCause(error.getCause());
        }
        if (error instanceof SocketException || error instanceof SocketTimeoutException
                || error instanceof UnknownHostException || error instanceof HttpTimeoutException) {
            return isExpectedHttpCause(error.getCause());
        }
        return isExpectedFailure(error);
    }

    private Map<String, Object> describeSafely(Throwable error) {
        try {
            return describe(error, 0);
        } catch (RuntimeException exception) {
            return Map.of("type", error.getClass().getSimpleName());
        }
    }

    private String environmentName() {
        if (environment.matchesProfiles("prod & !local & !dev & !test & !fake")) {
            return "prod";
        }
        if (environment.getActiveProfiles().length > 0) {
            return String.join(",", environment.getActiveProfiles());
        }
        return String.join(",", environment.getDefaultProfiles());
    }
}
