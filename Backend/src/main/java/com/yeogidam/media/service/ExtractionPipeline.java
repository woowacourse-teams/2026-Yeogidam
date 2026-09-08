package com.yeogidam.media.service;

import com.yeogidam.media.domain.ExtractionFailureReason;
import com.yeogidam.media.domain.MediaShortcode;
import com.yeogidam.media.exception.ExtractionFailedException;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

/**
 * 접수된 릴스의 장소 추출을 비동기로 진행한다.
 * 사용자가 앱을 벗어나도 서버에서 계속 진행되는 이유가 이 비동기 실행이다.
 */
@Service
public class ExtractionPipeline {

    public static final int PROCESSING_VERSION = 1;

    private final ExtractionProcess extractionProcess;
    private final ExtractionResultRecorder extractionResultRecorder;

    public ExtractionPipeline(
            ExtractionProcess extractionProcess,
            ExtractionResultRecorder extractionResultRecorder
    ) {
        this.extractionProcess = extractionProcess;
        this.extractionResultRecorder = extractionResultRecorder;
    }

    @Async("extractionTaskExecutor")
    public void run(
            Long mediaId,
            String shortcode
    ) {
        try {
            extractionResultRecorder.recordSuccess(mediaId, extractionProcess.run(new MediaShortcode(shortcode)));
        } catch (ExtractionFailedException exception) {
            extractionResultRecorder.recordFailure(mediaId, exception.reason());
        } catch (RuntimeException exception) {
            extractionResultRecorder.recordFailure(mediaId, ExtractionFailureReason.UNEXPECTED);
        }
    }
}
