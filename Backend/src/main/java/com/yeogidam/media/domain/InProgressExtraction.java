package com.yeogidam.media.domain;

import com.yeogidam.media.exception.RetryNotAllowedException;
import com.yeogidam.media.exception.UnselectablePlaceException;

public class InProgressExtraction implements Extraction {

    @Override
    public ExtractionStatus status() {
        return ExtractionStatus.EXTRACTING;
    }

    @Override
    public Extraction succeed(ExtractedPlaces extractedPlaces) {
        return new SucceededExtraction(extractedPlaces);
    }

    @Override
    public Extraction fail(ExtractionFailureReason failureReason) {
        return new FailedExtraction(failureReason);
    }

    @Override
    public Extraction retry() {
        throw new RetryNotAllowedException("추출이 진행 중인 릴스는 다시 시도할 수 없습니다.");
    }

    @Override
    public ExtractedPlaces extractedPlaces() {
        throw new UnselectablePlaceException("추출이 끝나지 않은 릴스에는 선택할 장소가 없습니다.");
    }

    @Override
    public ExtractionFailureReason failureReason() {
        return null;
    }
}
