package com.yeogidam.media.share.domain;

import com.yeogidam.media.exception.MediaErrorCode;
import com.yeogidam.media.exception.MediaException;
import com.yeogidam.media.extraction.domain.ExtractionFailureReason;
import com.yeogidam.media.extraction.domain.ExtractionStatus;
import com.yeogidam.media.instagram.domain.InstagramUrl;

public record ExtractionRetrySource(
        Long mediaId,
        InstagramUrl instagramUrl,
        ExtractionStatus extractionStatus,
        ExtractionFailureReason failureReason,
        int extractionVersion
) {
    public void validateRetry(int pipelineVersion) {
        validateFailed();
        if (!isRetryEligible(pipelineVersion)) {
            throw new MediaException(MediaErrorCode.RETRY_NOT_ELIGIBLE);
        }
    }

    private void validateFailed() {
        if (extractionStatus == ExtractionStatus.SUCCEEDED) {
            throw new MediaException(MediaErrorCode.RETRY_ON_SUCCEEDED);
        }
        if (extractionStatus == ExtractionStatus.EXTRACTING) {
            throw new MediaException(MediaErrorCode.RETRY_WHILE_EXTRACTING);
        }
    }

    private boolean isRetryEligible(int pipelineVersion) {
        if (extractionVersion < pipelineVersion) {
            return true;
        }
        return extractionVersion == pipelineVersion
                && (failureReason == ExtractionFailureReason.PROCESSING_FAILED
                || failureReason == ExtractionFailureReason.UNEXPECTED);
    }
}
