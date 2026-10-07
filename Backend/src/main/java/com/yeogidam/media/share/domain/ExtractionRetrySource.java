package com.yeogidam.media.share.domain;

import com.yeogidam.media.exception.MediaErrorCode;
import com.yeogidam.media.exception.MediaException;
import com.yeogidam.media.extraction.domain.ExtractionSnapshot;
import com.yeogidam.media.extraction.domain.ExtractionStatus;
import com.yeogidam.media.instagram.domain.InstagramUrl;

public record ExtractionRetrySource(
        Long mediaId,
        InstagramUrl instagramUrl,
        ExtractionSnapshot snapshot
) {
    public void validateRetry(int pipelineVersion) {
        validateFailed();
        if (!snapshot.canRetry(pipelineVersion)) {
            throw new MediaException(MediaErrorCode.RETRY_NOT_ELIGIBLE);
        }
    }

    private void validateFailed() {
        if (snapshot.status() == ExtractionStatus.SUCCEEDED) {
            throw new MediaException(MediaErrorCode.RETRY_ON_SUCCEEDED);
        }
        if (snapshot.status() == ExtractionStatus.EXTRACTING) {
            throw new MediaException(MediaErrorCode.RETRY_WHILE_EXTRACTING);
        }
    }
}
