package com.yeogidam.media.domain;

import com.yeogidam.media.exception.MediaErrorCode;
import com.yeogidam.media.exception.MediaException;

public class InProgressExtraction implements Extraction {

    @Override
    public ExtractionStatus status() {
        return ExtractionStatus.EXTRACTING;
    }

    @Override
    public Extraction succeed(ExtractedPlaces places) {
        return new SucceededExtraction(places);
    }

    @Override
    public Extraction fail(ExtractionFailureReason failureReason) {
        return new FailedExtraction(failureReason);
    }

    @Override
    public Extraction retry() {
        throw new MediaException(MediaErrorCode.RETRY_WHILE_EXTRACTING);
    }

    @Override
    public ExtractedPlaces places() {
        throw new MediaException(MediaErrorCode.EXTRACTION_NOT_FINISHED);
    }

    @Override
    public ExtractionFailureReason failureReason() {
        return null;
    }
}
