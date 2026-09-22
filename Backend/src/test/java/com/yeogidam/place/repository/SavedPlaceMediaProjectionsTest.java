package com.yeogidam.place.repository;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * "릴스당 최신 공유 한 건" 규칙은 순수 규칙이라 DB 없이 검증한다. 입력 순서에 기대지 않는지도 여기서 본다.
 */
class SavedPlaceMediaProjectionsTest {

    @Test
    void 같은_릴스를_여러_번_공유했으면_최신_공유_한_건만_남고_최신_공유_순으로_정렬된다() {
        // given
        SavedPlaceMediaProjections shares = new SavedPlaceMediaProjections(List.of(
                share(100L, 10L, "2026-09-10T10:00:00Z"),
                share(105L, 12L, "2026-09-11T10:00:00Z"),
                share(102L, 10L, "2026-09-12T10:00:00Z")
        ));

        // when
        List<SavedPlaceMediaProjection> latest = shares.latestPerMedia();

        // then
        assertThat(latest).extracting(SavedPlaceMediaProjection::sharedMediaId)
                .containsExactly(102L, 105L);
    }

    @Test
    void 같은_시각이면_나중에_생긴_공유가_최신이다() {
        // given
        SavedPlaceMediaProjections shares = new SavedPlaceMediaProjections(List.of(
                share(102L, 10L, "2026-09-12T10:00:00Z"),
                share(100L, 10L, "2026-09-12T10:00:00Z")
        ));

        // when & then
        assertThat(shares.latestPerMedia()).extracting(SavedPlaceMediaProjection::sharedMediaId)
                .containsExactly(102L);
    }

    @Test
    void 연결된_공유가_없으면_빈_목록이다() {
        assertThat(new SavedPlaceMediaProjections(List.of()).latestPerMedia()).isEmpty();
    }

    private SavedPlaceMediaProjection share(Long sharedMediaId, Long mediaId, String sharedAt) {
        return new SavedPlaceMediaProjection(sharedMediaId, mediaId, null, "@author", "caption",
                "https://www.instagram.com/reel/x/", Instant.parse(sharedAt));
    }
}
