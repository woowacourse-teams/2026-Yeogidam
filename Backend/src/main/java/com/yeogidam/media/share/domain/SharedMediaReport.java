package com.yeogidam.media.share.domain;

import com.yeogidam.media.exception.MediaErrorCode;
import com.yeogidam.media.exception.MediaException;
import com.yeogidam.media.extraction.domain.ExtractionStatus;
import java.time.Instant;

public record SharedMediaReport(
        Long sharedMediaId,
        ExtractionStatus extractionStatus,
        Instant createdAt
) {
    public SharedMediaReport {
        if (extractionStatus != ExtractionStatus.FAILED) {
            throw new MediaException(MediaErrorCode.REPORT_ON_NON_FAILED);
        }
    }
}
