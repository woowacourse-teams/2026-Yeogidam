package com.yeogidam.media.extraction.domain;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.EnumSource;

class ExtractionSnapshotTest {

    private static final int PIPELINE_VERSION = 3;

    @ParameterizedTest
    @EnumSource(ExtractionFailureReason.class)
    void 이전_버전의_실패는_실패_사유와_관계없이_재시도할_수_있다(ExtractionFailureReason failureReason) {
        // given
        ExtractionSnapshot snapshot = new ExtractionSnapshot(ExtractionStatus.FAILED, failureReason, 2, MediaSourceType.EXTRACTED);

        // when
        boolean canRetry = snapshot.canRetry(PIPELINE_VERSION);

        // then
        assertThat(canRetry).isTrue();
    }

    @ParameterizedTest
    @EnumSource(value = ExtractionFailureReason.class, names = {"PROCESSING_FAILED", "UNEXPECTED"})
    void 현재_버전의_처리_오류와_예상하지_못한_실패는_재시도할_수_있다(ExtractionFailureReason failureReason) {
        // given
        ExtractionSnapshot snapshot = new ExtractionSnapshot(
                ExtractionStatus.FAILED, failureReason, PIPELINE_VERSION, MediaSourceType.EXTRACTED);

        // when
        boolean canRetry = snapshot.canRetry(PIPELINE_VERSION);

        // then
        assertThat(canRetry).isTrue();
    }

    @ParameterizedTest
    @EnumSource(value = ExtractionFailureReason.class,
            names = {"CONTENT_UNAVAILABLE", "PLACE_NOT_EXTRACTED", "PLACE_NOT_MATCHED"})
    void 현재_버전의_대상_외_실패는_재시도할_수_없다(ExtractionFailureReason failureReason) {
        // given
        ExtractionSnapshot snapshot = new ExtractionSnapshot(
                ExtractionStatus.FAILED, failureReason, PIPELINE_VERSION, MediaSourceType.EXTRACTED);

        // when
        boolean canRetry = snapshot.canRetry(PIPELINE_VERSION);

        // then
        assertThat(canRetry).isFalse();
    }

    @ParameterizedTest
    @EnumSource(ExtractionFailureReason.class)
    void 현재_파이프라인보다_높은_버전의_실패는_재시도할_수_없다(ExtractionFailureReason failureReason) {
        // given
        ExtractionSnapshot snapshot = new ExtractionSnapshot(ExtractionStatus.FAILED, failureReason, 4, MediaSourceType.EXTRACTED);

        // when
        boolean canRetry = snapshot.canRetry(PIPELINE_VERSION);

        // then
        assertThat(canRetry).isFalse();
    }

    @ParameterizedTest
    @CsvSource({"SUCCEEDED,2", "SUCCEEDED,3", "SUCCEEDED,4", "EXTRACTING,2", "EXTRACTING,3", "EXTRACTING,4"})
    void 성공했거나_처리_중인_분석은_버전과_관계없이_재시작할_수_없다(ExtractionStatus status, int version) {
        // given
        ExtractionSnapshot snapshot = new ExtractionSnapshot(status, null, version, MediaSourceType.EXTRACTED);

        // when
        boolean canRetry = snapshot.canRetry(PIPELINE_VERSION);

        // then
        assertThat(canRetry).isFalse();
    }

    @ParameterizedTest
    @EnumSource(ExtractionFailureReason.class)
    void 씨앗으로_넣은_게시물은_이전_버전의_실패여도_재시도할_수_없다(ExtractionFailureReason failureReason) {
        // given: 출처만 다르고 나머지는 재시도가 허용되는 가장 느슨한 조건이다.
        ExtractionSnapshot snapshot = new ExtractionSnapshot(
                ExtractionStatus.FAILED, failureReason, 2, MediaSourceType.SEEDED);

        // when
        boolean canRetry = snapshot.canRetry(PIPELINE_VERSION);

        // then
        assertThat(canRetry).isFalse();
    }
}
