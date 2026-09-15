package com.yeogidam.media.extraction.domain;

import static com.yeogidam.support.PlaceFixture.place;
import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertAll;

import java.util.List;
import java.util.function.Supplier;
import org.junit.jupiter.api.Test;

/**
 * DB에 적힌 상태 문자열을 상태 객체로 되살릴 때, 그 상태에 필요한 짝 데이터만 읽도록 공급자를 지연 호출하는지 본다.
 */
class ExtractionStatusTest {

    private static final ExtractedPlaces PLACES = new ExtractedPlaces(List.of(place(1L)));

    @Test
    void 진행중은_아무_짝_데이터도_읽지_않고_진행중_상태가_된다() {
        // when
        Extraction extraction = ExtractionStatus.EXTRACTING.toExtraction(untouched(), untouched());

        // then
        assertThat(extraction).isInstanceOf(InProgressExtraction.class);
    }

    @Test
    void 성공은_장소만_읽어_성공_상태가_된다() {
        // when
        Extraction extraction = ExtractionStatus.SUCCEEDED.toExtraction(() -> PLACES, untouched());

        // then
        assertAll(
                () -> assertThat(extraction).isInstanceOf(SucceededExtraction.class),
                () -> assertThat(extraction.places()).isSameAs(PLACES)
        );
    }

    @Test
    void 실패는_사유만_읽어_실패_상태가_된다() {
        // when
        Extraction extraction = ExtractionStatus.FAILED.toExtraction(
                untouched(), () -> ExtractionFailureReason.PLACE_NOT_EXTRACTED);

        // then
        assertAll(
                () -> assertThat(extraction).isInstanceOf(FailedExtraction.class),
                () -> assertThat(extraction.failureReason()).isEqualTo(ExtractionFailureReason.PLACE_NOT_EXTRACTED)
        );
    }

    private static <T> Supplier<T> untouched() {
        return () -> {
            throw new AssertionError("이 상태에서는 읽지 않아야 하는 짝 데이터를 읽었습니다.");
        };
    }
}
