package com.yeogidam.media.share.repository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertAll;

import java.time.Instant;
import java.util.List;
import java.util.stream.LongStream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * 50건 자르기와 다음 커서는 순수 규칙이라 DB 없이 검증한다.
 * 게시물마다 한 건 남기기, 최신 순 정렬, 커서 적용은 SQL이 맡으므로 DAO 테스트가 본다.
 */
class SavedMediaProjectionsTest {

    private static final Instant BASE = Instant.parse("2026-11-01T03:00:00.123456Z");

    @Test
    void 페이지_크기보다_한_건_더_읽었으면_50건만_보여주고_50번째_공유를_다음_커서로_준다() {
        // given: DAO가 게시물마다 한 건씩 최신순으로 51건을 읽어 왔다
        SavedMediaProjections shares = new SavedMediaProjections(sharesNewestFirst(51));

        // when
        List<SavedMediaProjection> page = shares.page();
        SharedMediaCursor nextCursor = shares.nextCursor();

        // then
        SavedMediaProjection fiftieth = page.getLast();
        assertAll(
                () -> assertThat(page).hasSize(50),
                () -> assertThat(page.getFirst().sharedMediaId()).isEqualTo(51L),
                () -> assertThat(fiftieth.sharedMediaId()).isEqualTo(2L),
                () -> assertThat(nextCursor).isEqualTo(new SharedMediaCursor(fiftieth.createdAt(), 2L))
        );
    }

    @ParameterizedTest
    @ValueSource(ints = {0, 1, 50})
    void 페이지_크기_이하로_읽었으면_전부_보여주고_다음_커서는_없다(int count) {
        // given
        SavedMediaProjections shares = new SavedMediaProjections(sharesNewestFirst(count));

        // when & then
        assertAll(
                () -> assertThat(shares.page()).hasSize(count),
                () -> assertThat(shares.nextCursor()).isNull()
        );
    }

    @Test
    void 장소를_붙일_게시물_ID는_이번_페이지_게시물만_순서대로_돌려준다() {
        // given: 51번째 공유는 다음 페이지가 있는지 보려고 더 읽은 것이다
        SavedMediaProjections shares = new SavedMediaProjections(sharesNewestFirst(51));

        // when
        List<Long> mediaIds = shares.pageMediaIds();

        // then: 게시물 ID를 공유 ID와 같게 만들었으므로 51부터 2까지 돌려준다
        assertThat(mediaIds).containsExactlyElementsOf(LongStream.rangeClosed(2, 51)
                .boxed()
                .toList()
                .reversed());
    }

    /**
     * 게시물 1부터 count까지 한 번씩 공유한 목록을 DAO가 반환하는 순서(최근 공유부터)로 만든다.
     * 공유 ID와 게시물 ID가 같고, 클수록 최근 공유다.
     */
    private static List<SavedMediaProjection> sharesNewestFirst(int count) {
        return LongStream.rangeClosed(1, count)
                .mapToObj(SavedMediaProjectionsTest::share)
                .toList()
                .reversed();
    }

    /**
     * 페이지 규칙은 공유 ID, 게시물 ID, 공유 시각만 보므로 나머지 값은 비워 둔다.
     */
    private static SavedMediaProjection share(long id) {
        return new SavedMediaProjection(id, id, BASE.plusSeconds(id), null, null, null, null, false);
    }
}
