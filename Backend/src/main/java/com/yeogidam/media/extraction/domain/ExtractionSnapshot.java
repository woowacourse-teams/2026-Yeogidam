package com.yeogidam.media.extraction.domain;

import com.yeogidam.media.exception.MediaErrorCode;
import com.yeogidam.media.exception.MediaException;

public record ExtractionSnapshot(
        ExtractionStatus status,
        ExtractionFailureReason failureReason,
        int version,
        MediaSourceType sourceType
) {
    public boolean canRetry(int pipelineVersion) {
        if (sourceType == MediaSourceType.SEEDED) {
            return false;
        }
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

    /**
     * 재시도 요청이 들어왔을 때 이 게시물로 만들 이력의 상태.
     * 이미 성공했거나 분석 중이면 그 결과에 합류하고, 재시도할 수 있는 실패면 다시 분석을 시작한다.
     */
    public ExtractionStatus statusAfterRetry(int pipelineVersion) {
        if (status != ExtractionStatus.FAILED) {
            return status;
        }
        if (!canRetry(pipelineVersion)) {
            throw new MediaException(MediaErrorCode.RETRY_NOT_ELIGIBLE);
        }
        return ExtractionStatus.EXTRACTING;
    }
}
