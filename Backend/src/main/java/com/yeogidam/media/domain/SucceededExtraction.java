package com.yeogidam.media.domain;

import com.yeogidam.media.exception.InvalidExtractionTransitionException;
import com.yeogidam.media.exception.RetryNotAllowedException;

public class SucceededExtraction implements Extraction {

    private final ExtractedPlaces extractedPlaces;

    public SucceededExtraction(ExtractedPlaces extractedPlaces) {
        validate(extractedPlaces);
        this.extractedPlaces = extractedPlaces;
    }

    private void validate(ExtractedPlaces extractedPlaces) {
        if (extractedPlaces == null) {
            throw new IllegalArgumentException("추출에 성공한 릴스는 장소가 필요합니다.");
        }
    }

    @Override
    public ExtractionStatus status() {
        return ExtractionStatus.SUCCEEDED;
    }

    @Override
    public Extraction succeed(ExtractedPlaces ignored) {
        throw new InvalidExtractionTransitionException("이미 추출이 끝난 릴스입니다.");
    }

    @Override
    public Extraction fail(ExtractionFailureReason ignored) {
        throw new InvalidExtractionTransitionException("이미 추출이 끝난 릴스입니다.");
    }

    @Override
    public Extraction retry() {
        throw new RetryNotAllowedException("추출에 성공한 릴스는 다시 시도할 수 없습니다.");
    }

    @Override
    public ExtractedPlaces extractedPlaces() {
        return extractedPlaces;
    }

    @Override
    public ExtractionFailureReason failureReason() {
        return null;
    }
}
