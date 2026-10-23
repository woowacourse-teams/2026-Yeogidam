package com.yeogidam.media.share.repository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertAll;

import java.time.Instant;
import java.util.List;
import java.util.stream.LongStream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class ShareHistoryProjectionsTest {

    private static final Instant BASE = Instant.parse("2026-09-20T03:00:00.123456Z");

    @Test
    void 페이지_크기보다_한_건_더_읽었으면_50건만_보여주고_50번째_공유를_다음_커서로_준다() {
        // given: DAO가 최신순으로 51건을 읽어 왔다
        ShareHistoryProjections history = new ShareHistoryProjections(sharesNewestFirst(51));

        // when
        List<ShareHistoryProjection> page = history.page();
        ShareHistoryCursor nextCursor = history.nextCursor();

        // then
        ShareHistoryProjection fiftieth = page.getLast();
        assertAll(
                () -> assertThat(page).hasSize(50),
                () -> assertThat(page.getFirst().sharedMediaId()).isEqualTo(51L),
                () -> assertThat(fiftieth.sharedMediaId()).isEqualTo(2L),
                () -> assertThat(nextCursor).isEqualTo(new ShareHistoryCursor(fiftieth.createdAt(), 2L))
        );
    }

    @ParameterizedTest
    @ValueSource(ints = {0, 1, 50})
    void 페이지_크기_이하로_읽었으면_전부_보여주고_다음_커서는_없다(int count) {
        // given
        ShareHistoryProjections history = new ShareHistoryProjections(sharesNewestFirst(count));

        // when & then
        assertAll(
                () -> assertThat(history.page()).hasSize(count),
                () -> assertThat(history.nextCursor()).isNull()
        );
    }

    /**
     * 공유 1부터 count까지 만들어 DAO가 반환하는 순서(최근 공유부터)로 뒤집는다. ID가 클수록 최근 공유다.
     */
    private static List<ShareHistoryProjection> sharesNewestFirst(int count) {
        return LongStream.rangeClosed(1, count)
                .mapToObj(ShareHistoryProjectionsTest::share)
                .toList()
                .reversed();
    }

    /**
     * 페이지 규칙은 공유 ID와 공유 시각만 보므로 나머지 값은 비워 둔다.
     */
    private static ShareHistoryProjection share(long id) {
        return new ShareHistoryProjection(id, BASE.plusSeconds(id), null, null, null, "SUCCEEDED", null, null);
    }
}
