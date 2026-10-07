package com.yeogidam.media.extraction.domain;

public record ExtractionSnapshot(
        ExtractionStatus status,
        ExtractionFailureReason failureReason,
        int version
) {
    public boolean canRetry(int pipelineVersion) {
        if (status != ExtractionStatus.FAILED) {
            return false;
        }
        if (version < pipelineVersion) {
            return true;
        }
        return version == pipelineVersion
                && (failureReason == ExtractionFailureReason.PROCESSING_FAILED
                || failureReason == ExtractionFailureReason.UNEXPECTED);
    }
}
