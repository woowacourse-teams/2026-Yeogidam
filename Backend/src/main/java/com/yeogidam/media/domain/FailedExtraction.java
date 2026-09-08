package com.yeogidam.media.domain;

import com.yeogidam.media.exception.InvalidExtractionTransitionException;
import com.yeogidam.media.exception.UnselectablePlaceException;

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
        throw new InvalidExtractionTransitionException("이미 추출이 끝난 게시물입니다.");
    }

    @Override
    public Extraction fail(ExtractionFailureReason ignored) {
        throw new InvalidExtractionTransitionException("이미 추출이 끝난 게시물입니다.");
    }

    @Override
    public Extraction retry() {
        return new InProgressExtraction();
    }

    @Override
    public ExtractedPlaces places() {
        throw new UnselectablePlaceException("추출에 실패한 게시물에는 장소가 없습니다.");
    }

    @Override
    public ExtractionFailureReason failureReason() {
        return failureReason;
    }
}
