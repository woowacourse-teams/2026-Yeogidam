package com.yeogidam.media.extraction.exception;

import com.yeogidam.media.extraction.domain.ExtractionFailureReason;

public class ExtractionFailedException extends RuntimeException {

    private final ExtractionFailureReason reason;

    public ExtractionFailedException(ExtractionFailureReason reason) {
        this(reason, null);
    }

    public ExtractionFailedException(ExtractionFailureReason reason, Throwable cause) {
        super(reason.description(), cause);
        this.reason = reason;
    }

    public ExtractionFailureReason reason() {
        return reason;
    }
}
