package com.yeogidam.media.extraction.service;

import com.yeogidam.media.extraction.domain.ExtractionFailureReason;
import com.yeogidam.media.extraction.exception.ExtractionFailedException;
import com.yeogidam.media.extraction.logging.ExtractionTimeline;
import com.yeogidam.media.instagram.domain.InstagramUrl;
import com.yeogidam.media.instagram.domain.MediaMetadata;
import com.yeogidam.media.instagram.exception.InstagramContentUnavailableException;
import com.yeogidam.media.instagram.repository.InstagramMediaDao;
import com.yeogidam.media.share.repository.SharedMediaDao;
import lombok.extern.slf4j.Slf4j;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.task.TaskExecutor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

@Slf4j
@Service
public class MediaExtractionDispatcher {

    private static final String MDC_MEDIA_ID = "mediaId";

    private final MediaExtractionPipeline mediaExtractionPipeline;
    private final TaskExecutor mediaMetadataExecutor;
    private final TaskExecutor mediaAnalysisExecutor;
    private final InstagramMediaDao instagramMediaDao;
    private final SharedMediaDao sharedMediaDao;
    private final TransactionTemplate failureTransactionTemplate;

    public MediaExtractionDispatcher(
            MediaExtractionPipeline mediaExtractionPipeline,
            @Qualifier("mediaMetadataExecutor") TaskExecutor mediaMetadataExecutor,
            @Qualifier("mediaAnalysisExecutor") TaskExecutor mediaAnalysisExecutor,
            InstagramMediaDao instagramMediaDao,
            SharedMediaDao sharedMediaDao,
            PlatformTransactionManager transactionManager
    ) {
        this.mediaExtractionPipeline = mediaExtractionPipeline;
        this.mediaMetadataExecutor = mediaMetadataExecutor;
        this.mediaAnalysisExecutor = mediaAnalysisExecutor;
        this.instagramMediaDao = instagramMediaDao;
        this.sharedMediaDao = sharedMediaDao;
        this.failureTransactionTemplate = new TransactionTemplate(transactionManager);
        this.failureTransactionTemplate.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    public void dispatchAfterCommit(Long mediaId, InstagramUrl instagramUrl) {
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                // 실행기의 데코레이터가 요청 스레드의 MDC를 메타데이터 스레드로, 다시 분석 스레드로 옮기므로 추출 로그마다 mediaId가 붙는다.
                try (MDC.MDCCloseable ignored = MDC.putCloseable(MDC_MEDIA_ID, String.valueOf(mediaId))) {
                    mediaMetadataExecutor.execute(() -> extractMetadata(mediaId, instagramUrl));
                } catch (RuntimeException exception) {
                    markExtractionFailed(mediaId, instagramUrl.getMediaShortcode().value(),
                            failureReasonFor(exception));
                    log.error("미디어 장소 추출 작업을 등록하지 못했습니다. mediaId={}, shortcode={}",
                            mediaId, instagramUrl.getMediaShortcode().value(), exception);
                }
            }
        });
    }

    private void extractMetadata(Long mediaId, InstagramUrl instagramUrl) {
        runExtraction(mediaId, instagramUrl, () -> {
            MediaMetadata metadata = mediaExtractionPipeline.readMetadata(mediaId, instagramUrl);
            // 접수되면 단계 로그 기록은 분석 스레드가 이어 쓰므로, 접수 뒤에 예외가 날 수 있는 코드를 두지 않는다.
            // 뒤에서 예외가 나면 이 스레드도 실패 끝 줄을 남겨 작업 하나에 끝 줄이 둘 생긴다.
            mediaAnalysisExecutor.execute(() -> analyze(mediaId, instagramUrl, metadata));
        });
    }

    private void analyze(Long mediaId, InstagramUrl instagramUrl, MediaMetadata metadata) {
        runExtraction(mediaId, instagramUrl, () -> {
            mediaExtractionPipeline.analyze(mediaId, instagramUrl, metadata);
            ExtractionTimeline.succeeded();
        });
    }

    private void runExtraction(Long mediaId, InstagramUrl instagramUrl, Runnable task) {
        try {
            task.run();
        } catch (RuntimeException exception) {
            boolean interrupted = hasInterruptedCause(exception);
            if (interrupted) {
                Thread.interrupted();
            }
            try {
                ExtractionFailureReason failureReason = failureReasonFor(exception);
                markExtractionFailed(mediaId, instagramUrl.getMediaShortcode().value(), failureReason);
                logExtractionFailure(mediaId, instagramUrl, exception, interrupted);
                ExtractionTimeline.failed(failureReason);
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

    private void logExtractionFailure(
            Long mediaId,
            InstagramUrl instagramUrl,
            RuntimeException exception,
            boolean interrupted
    ) {
        if (interrupted) {
            log.error("미디어 장소 추출 작업이 중단되었습니다. mediaId={}, shortcode={}",
                    mediaId, instagramUrl.getMediaShortcode().value(), exception);
            return;
        }
        log.error("미디어 장소 추출에 실패했습니다. mediaId={}, shortcode={}",
                mediaId, instagramUrl.getMediaShortcode().value(), exception);
    }

    private void markExtractionFailed(Long mediaId, String shortcode, ExtractionFailureReason failureReason) {
        try {
            failureTransactionTemplate.executeWithoutResult(status -> {
                if (instagramMediaDao.failExtractionIfInProgress(mediaId, failureReason)) {
                    sharedMediaDao.updatePendingExtractions(mediaId);
                }
            });
        } catch (RuntimeException exception) {
            log.error("인스타그램 미디어 메타데이터 추출 실패 상태를 저장하지 못했습니다. mediaId={}, shortcode={}",
                    mediaId, shortcode, exception);
        }
    }
}
