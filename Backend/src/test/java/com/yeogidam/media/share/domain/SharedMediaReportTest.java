package com.yeogidam.media.share.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertAll;

import com.yeogidam.media.exception.MediaErrorCode;
import com.yeogidam.media.exception.MediaException;
import com.yeogidam.media.extraction.domain.ExtractionStatus;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

class SharedMediaReportTest {

    private static final Long SHARED_MEDIA_ID = 101L;
    private static final Instant REPORTED_AT = Instant.parse("2026-10-06T01:00:00Z");

    @Test
    void 실패한_이력은_신고를_만들_수_있다() {
        // when
        SharedMediaReport report = new SharedMediaReport(SHARED_MEDIA_ID, ExtractionStatus.FAILED, REPORTED_AT);

        // then
        assertAll(
                () -> assertThat(report.sharedMediaId()).isEqualTo(SHARED_MEDIA_ID),
                () -> assertThat(report.extractionStatus()).isEqualTo(ExtractionStatus.FAILED),
                () -> assertThat(report.createdAt()).isEqualTo(REPORTED_AT)
        );
    }

    @ParameterizedTest
    @EnumSource(value = ExtractionStatus.class, names = {"EXTRACTING", "SUCCEEDED"})
    void 실패하지_않은_이력으로_신고를_만들면_예외가_발생한다(ExtractionStatus status) {
        // when & then
        assertThatThrownBy(() -> new SharedMediaReport(SHARED_MEDIA_ID, status, REPORTED_AT))
                .isInstanceOfSatisfying(MediaException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(MediaErrorCode.REPORT_ON_NON_FAILED));
    }
}
