package com.yeogidam.media.extraction.exception;

import com.yeogidam.media.extraction.domain.ExtractionFailureReason;

/**
 * 추출 파이프라인 내부 신호. 어느 단계가 왜 멈췄는지 사유를 실어 나르고,
 * 파이프라인 밖으로는 나가지 않는다.
 */
public class ExtractionFailedException extends RuntimeException {

    private final ExtractionFailureReason reason;

    public ExtractionFailedException(ExtractionFailureReason reason) {
        super(reason.description());
        this.reason = reason;
    }

    public ExtractionFailureReason reason() {
        return reason;
    }
}
