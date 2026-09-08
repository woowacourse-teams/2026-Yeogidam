package com.yeogidam.media.domain;

import com.yeogidam.media.exception.InvalidExtractionTransitionException;
import com.yeogidam.media.exception.RetryNotAllowedException;

public class SucceededExtraction implements Extraction {

    private final ExtractedPlaces places;

    public SucceededExtraction(ExtractedPlaces places) {
        validate(places);
        this.places = places;
    }

    private void validate(ExtractedPlaces places) {
        if (places == null) {
            throw new IllegalArgumentException("추출에 성공한 게시물은 장소가 필요합니다.");
        }
    }

    @Override
    public ExtractionStatus status() {
        return ExtractionStatus.SUCCEEDED;
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
        throw new RetryNotAllowedException("추출에 성공한 게시물은 다시 시도할 수 없습니다.");
    }

    @Override
    public ExtractedPlaces places() {
        return places;
    }

    @Override
    public ExtractionFailureReason failureReason() {
        return null;
    }
}
