package com.yeogidam.media.domain;

import com.yeogidam.media.exception.MediaErrorCode;
import com.yeogidam.media.exception.MediaException;

public class FailedExtraction implements Extraction {

    private final ExtractionFailureReason failureReason;

    public FailedExtraction(ExtractionFailureReason failureReason) {
        validate(failureReason);
        this.failureReason = failureReason;
    }

    private void validate(ExtractionFailureReason failureReason) {
        if (failureReason == null) {
            throw new IllegalArgumentException("추출에 실패한 게시물은 실패 사유가 필요합니다.");
        }
    }

    @Override
    public ExtractionStatus status() {
        return ExtractionStatus.FAILED;
    }

    @Override
    public Extraction succeed(ExtractedPlaces ignored) {
        throw new MediaException(MediaErrorCode.EXTRACTION_ALREADY_FINISHED);
    }

    @Override
    public Extraction fail(ExtractionFailureReason ignored) {
        throw new MediaException(MediaErrorCode.EXTRACTION_ALREADY_FINISHED);
    }

    @Override
    public Extraction retry() {
        return new InProgressExtraction();
    }

    @Override
    public ExtractedPlaces places() {
        throw new MediaException(MediaErrorCode.FAILED_EXTRACTION_HAS_NO_PLACES);
    }

    @Override
    public ExtractionFailureReason failureReason() {
        return failureReason;
    }
}
