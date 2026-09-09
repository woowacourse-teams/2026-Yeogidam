package com.yeogidam.media.domain;

import com.yeogidam.media.exception.MediaErrorCode;
import com.yeogidam.media.exception.MediaException;

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
        throw new MediaException(MediaErrorCode.EXTRACTION_ALREADY_FINISHED);
    }

    @Override
    public Extraction fail(ExtractionFailureReason ignored) {
        throw new MediaException(MediaErrorCode.EXTRACTION_ALREADY_FINISHED);
    }

    @Override
    public Extraction retry() {
        throw new MediaException(MediaErrorCode.RETRY_ON_SUCCEEDED);
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
