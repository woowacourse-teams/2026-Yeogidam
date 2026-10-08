package com.yeogidam.media.share.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.yeogidam.media.exception.MediaErrorCode;
import com.yeogidam.media.exception.MediaException;
import com.yeogidam.media.extraction.domain.ExtractionFailureReason;
import com.yeogidam.media.extraction.domain.ExtractionSnapshot;
import com.yeogidam.media.extraction.domain.ExtractionStatus;
import com.yeogidam.media.extraction.domain.MediaSourceType;
import com.yeogidam.media.instagram.domain.InstagramUrl;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.EnumSource;

class ExtractionRetrySourceTest {

    private static final int PIPELINE_VERSION = 3;

    @ParameterizedTest
    @EnumSource(ExtractionFailureReason.class)
    void 이전_버전의_실패_이력은_사유와_관계없이_재시도할_수_있다(ExtractionFailureReason failureReason) {
        // given
        ExtractionRetrySource source = createSource(ExtractionStatus.FAILED, failureReason, PIPELINE_VERSION - 1);

        // when & then
        assertThatCode(() -> source.validateRetry(PIPELINE_VERSION))
                .doesNotThrowAnyException();
    }

    @ParameterizedTest
    @EnumSource(value = ExtractionFailureReason.class, names = {"PROCESSING_FAILED", "UNEXPECTED"})
    void 현재_버전의_처리_오류와_예상하지_못한_실패_이력은_재시도할_수_있다(ExtractionFailureReason failureReason) {
        // given
        ExtractionRetrySource source = createSource(ExtractionStatus.FAILED, failureReason, PIPELINE_VERSION);

        // when & then
        assertThatCode(() -> source.validateRetry(PIPELINE_VERSION))
                .doesNotThrowAnyException();
    }

    @ParameterizedTest
    @EnumSource(value = ExtractionFailureReason.class,
            names = {"CONTENT_UNAVAILABLE", "PLACE_NOT_EXTRACTED", "PLACE_NOT_MATCHED"})
    void 현재_버전의_대상_외_실패_이력을_재시도하면_예외가_발생한다(ExtractionFailureReason failureReason) {
        // given
        ExtractionRetrySource source = createSource(ExtractionStatus.FAILED, failureReason, PIPELINE_VERSION);

        // when & then
        assertThatThrownBy(() -> source.validateRetry(PIPELINE_VERSION))
                .isInstanceOfSatisfying(MediaException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(MediaErrorCode.RETRY_NOT_ELIGIBLE));
    }

    @ParameterizedTest
    @CsvSource({"SUCCEEDED,RETRY_ON_SUCCEEDED", "EXTRACTING,RETRY_WHILE_EXTRACTING"})
    void 실패하지_않은_이력을_재시도하면_상태에_해당하는_예외가_발생한다(ExtractionStatus status, MediaErrorCode errorCode) {
        // given
        ExtractionRetrySource source = createSource(status, null, PIPELINE_VERSION - 1);

        // when & then
        assertThatThrownBy(() -> source.validateRetry(PIPELINE_VERSION))
                .isInstanceOfSatisfying(MediaException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(errorCode));
    }

    private ExtractionRetrySource createSource(
            ExtractionStatus status,
            ExtractionFailureReason failureReason,
            int version
    ) {
        return new ExtractionRetrySource(
                1L,
                new InstagramUrl("https://www.instagram.com/reel/retry-source/"),
                new ExtractionSnapshot(status, failureReason, version, MediaSourceType.EXTRACTED)
        );
    }
}
