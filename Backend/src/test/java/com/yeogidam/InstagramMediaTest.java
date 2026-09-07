package com.yeogidam;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;

class InstagramMediaTest {

    private static final InstagramUrl INSTAGRAM_URL = new InstagramUrl(
            "https://www.instagram.com/reel/DcVaTEdRMyP/"
    );
    private static final String CAPTION = "서울에서 꼭 가봐야 할 장소";

    @Test
    void 장소가_한_개_이상이면_추출_성공으로_기록한다() {
        // given
        Place place = new Place(
                "경복궁",
                "관광명소"
        );

        // when
        InstagramMedia instagramMedia = new InstagramMedia(
                INSTAGRAM_URL,
                CAPTION,
                List.of(place)
        );

        // then
        Assertions.assertAll(
                () -> assertThat(instagramMedia.getExtractionStatus())
                        .isEqualTo(ExtractionStatus.SUCCEEDED),
                () -> assertThat(instagramMedia.getPlaces()).containsExactly(place),
                () -> assertThat(instagramMedia.getFailureReason()).isNull()
        );
    }

    @Test
    void 장소가_없으면_추출_성공으로_기록할_수_없다() {
        // when & then
        assertThatThrownBy(() -> new InstagramMedia(
                INSTAGRAM_URL,
                CAPTION,
                List.of()
        ))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("장소 추출에 성공한 미디어는 장소가 한 개 이상이어야 합니다.");
    }

    @Test
    void 실패_사유와_함께_추출_실패로_기록한다() {
        // when
        InstagramMedia instagramMedia = new InstagramMedia(
                INSTAGRAM_URL,
                CAPTION,
                ExtractionFailureReason.PLACE_NOT_FOUND
        );

        // then
        Assertions.assertAll(
                () -> assertThat(instagramMedia.getExtractionStatus())
                        .isEqualTo(ExtractionStatus.FAILED),
                () -> assertThat(instagramMedia.getPlaces()).isEmpty(),
                () -> assertThat(instagramMedia.getFailureReason())
                        .isEqualTo(ExtractionFailureReason.PLACE_NOT_FOUND)
        );
    }

    @Test
    void 실패_사유가_없으면_추출_실패로_기록할_수_없다() {
        // when & then
        assertThatThrownBy(() -> new InstagramMedia(
                INSTAGRAM_URL,
                CAPTION,
                (ExtractionFailureReason) null
        ))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("실패한 미디어는 실패 사유가 필요합니다.");
    }

    @Test
    void 인스타그램_URL이_없으면_생성할_수_없다() {
        // when & then
        assertThatThrownBy(() -> new InstagramMedia(
                null,
                CAPTION,
                List.of(new Place(
                        "경복궁",
                        "관광명소"
                ))
        ))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("인스타그램 URL은 null일 수 없습니다.");
    }
}
