package com.yeogidam.media.extraction.domain;

import static com.yeogidam.support.PlaceFixture.place;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertAll;

import com.yeogidam.media.exception.MediaErrorCode;
import com.yeogidam.media.exception.MediaException;
import java.util.List;
import java.util.stream.Stream;
import org.assertj.core.api.ThrowableAssert.ThrowingCallable;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * 상태별 전이 표를 고정한다. 진행중에서의 성공과 실패, 성공 상태의 재시도 거부는 InstagramMediaTest가 게시물을 통해 검증하므로 여기서는
 * 나머지 칸(진행중의 재시도와 장소 읽기, 끝난 상태의 재기록, 실패 상태의 장소 읽기, 사유 유무)을 본다.
 */
class ExtractionTest {

    private static final ExtractedPlaces PLACES = new ExtractedPlaces(List.of(place(1L)));

    @Test
    void 진행중이면_다시_시도할_수_없고_장소도_읽을_수_없다() {
        // given
        Extraction extraction = new InProgressExtraction();

        // when & then
        assertAll(
                () -> assertMediaException(extraction::retry, MediaErrorCode.RETRY_WHILE_EXTRACTING),
                () -> assertMediaException(extraction::places, MediaErrorCode.EXTRACTION_NOT_FINISHED)
        );
    }

    @ParameterizedTest
    @MethodSource("finishedExtractions")
    void 끝난_추출은_다시_성공이나_실패로_기록할_수_없다(Extraction extraction) {
        assertAll(
                () -> assertMediaException(() -> extraction.succeed(PLACES),
                        MediaErrorCode.EXTRACTION_ALREADY_FINISHED),
                () -> assertMediaException(() -> extraction.fail(ExtractionFailureReason.UNEXPECTED),
                        MediaErrorCode.EXTRACTION_ALREADY_FINISHED)
        );
    }

    @Test
    void 성공한_추출은_장소를_돌려주고_실패_사유는_없다() {
        // given
        Extraction extraction = new SucceededExtraction(PLACES);

        // when & then
        assertAll(
                () -> assertThat(extraction.status()).isEqualTo(ExtractionStatus.SUCCEEDED),
                () -> assertThat(extraction.places()).isSameAs(PLACES),
                () -> assertThat(extraction.failureReason()).isNull()
        );
    }

    @Test
    void 실패한_추출은_사유를_돌려주고_장소는_없다() {
        // given
        Extraction extraction = new FailedExtraction(ExtractionFailureReason.PLACE_NOT_MATCHED);

        // when & then
        assertAll(
                () -> assertThat(extraction.status()).isEqualTo(ExtractionStatus.FAILED),
                () -> assertThat(extraction.failureReason()).isEqualTo(ExtractionFailureReason.PLACE_NOT_MATCHED),
                () -> assertMediaException(extraction::places, MediaErrorCode.FAILED_EXTRACTION_HAS_NO_PLACES)
        );
    }

    @Test
    void 실패한_추출을_다시_시도하면_사유_없는_진행중으로_돌아간다() {
        // given
        Extraction failed = new FailedExtraction(ExtractionFailureReason.CONTENT_UNAVAILABLE);

        // when
        Extraction retried = failed.retry();

        // then
        assertAll(
                () -> assertThat(retried.status()).isEqualTo(ExtractionStatus.EXTRACTING),
                () -> assertThat(retried.failureReason()).isNull(),
                () -> assertThat(failed.failureReason()).isEqualTo(ExtractionFailureReason.CONTENT_UNAVAILABLE)
        );
    }

    private static Stream<Arguments> finishedExtractions() {
        return Stream.of(
                Arguments.of(new SucceededExtraction(PLACES)),
                Arguments.of(new FailedExtraction(ExtractionFailureReason.UNEXPECTED))
        );
    }

    private static void assertMediaException(ThrowingCallable callable, MediaErrorCode errorCode) {
        assertThatThrownBy(callable)
                .isInstanceOfSatisfying(MediaException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(errorCode));
    }
}
