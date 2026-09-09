package com.yeogidam.media.instagram.domain;

import static com.yeogidam.support.PlaceFixture.place;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.yeogidam.media.exception.MediaErrorCode;
import com.yeogidam.media.exception.MediaException;
import com.yeogidam.media.extraction.domain.ExtractedPlaces;
import com.yeogidam.media.extraction.domain.ExtractionFailureReason;
import com.yeogidam.media.extraction.domain.ExtractionStatus;
import com.yeogidam.place.domain.Place;
import java.util.List;
import org.junit.jupiter.api.Test;

class InstagramMediaTest {

    private static final MediaShortcode SHORTCODE = new MediaShortcode("DcVaTEdRMyP");

    @Test
    void 새_게시물은_장소_추출을_진행한다() {
        InstagramMedia media = new InstagramMedia(SHORTCODE);

        assertThat(media.extraction().status()).isEqualTo(ExtractionStatus.EXTRACTING);
    }

    @Test
    void 장소가_한_개_이상이면_추출_성공으로_기록한다() {
        Place place = place(1L);
        InstagramMedia media = new InstagramMedia(SHORTCODE);

        media.succeed(new ExtractedPlaces(List.of(place)));

        assertThat(media.extraction().status()).isEqualTo(ExtractionStatus.SUCCEEDED);
        assertThat(media.extraction().places().values()).containsExactly(place);
        assertThat(media.extraction().failureReason()).isNull();
    }

    @Test
    void 장소가_없으면_추출_성공으로_기록할_수_없다() {
        InstagramMedia media = new InstagramMedia(SHORTCODE);

        assertThatThrownBy(() -> media.succeed(new ExtractedPlaces(List.of())))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(media.extraction().status()).isEqualTo(ExtractionStatus.EXTRACTING);
    }

    @Test
    void 실패_사유와_함께_추출_실패로_기록한다() {
        InstagramMedia media = new InstagramMedia(SHORTCODE);

        media.fail(ExtractionFailureReason.PLACE_NOT_EXTRACTED);

        assertThat(media.extraction().status()).isEqualTo(ExtractionStatus.FAILED);
        assertThat(media.extraction().failureReason()).isEqualTo(ExtractionFailureReason.PLACE_NOT_EXTRACTED);
        assertThatThrownBy(() -> media.extraction().places())
                .isInstanceOfSatisfying(MediaException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(MediaErrorCode.FAILED_EXTRACTION_HAS_NO_PLACES));
    }

    @Test
    void 실패_사유가_없으면_추출_실패로_기록할_수_없다() {
        InstagramMedia media = new InstagramMedia(SHORTCODE);

        assertThatThrownBy(() -> media.fail(null)).isInstanceOf(IllegalArgumentException.class);
        assertThat(media.extraction().status()).isEqualTo(ExtractionStatus.EXTRACTING);
    }

    @Test
    void 게시물_식별자가_없으면_생성할_수_없다() {
        assertThatThrownBy(() -> new InstagramMedia(null)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 실패한_추출은_다시_시도하고_성공할_수_있다() {
        InstagramMedia media = new InstagramMedia(SHORTCODE);
        media.fail(ExtractionFailureReason.PLACE_NOT_MATCHED);

        media.retry();

        assertThat(media.extraction().status()).isEqualTo(ExtractionStatus.EXTRACTING);
        assertThat(media.extraction().failureReason()).isNull();

        media.succeed(new ExtractedPlaces(List.of(place(1L))));

        assertThat(media.extraction().status()).isEqualTo(ExtractionStatus.SUCCEEDED);
    }

    @Test
    void 성공한_추출은_다시_시도할_수_없다() {
        InstagramMedia media = new InstagramMedia(SHORTCODE);
        media.succeed(new ExtractedPlaces(List.of(place(1L))));

        assertThatThrownBy(media::retry)
                .isInstanceOfSatisfying(MediaException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(MediaErrorCode.RETRY_ON_SUCCEEDED));
    }
}
