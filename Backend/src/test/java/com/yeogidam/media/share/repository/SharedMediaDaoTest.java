package com.yeogidam.media.share.repository;

import static com.yeogidam.support.fixture.sql.MediaSqlFixture.insertMedia;
import static com.yeogidam.support.fixture.sql.MemberSqlFixture.insertKakaoMember;
import static com.yeogidam.support.fixture.sql.SharedMediaSqlFixture.insertSharedMedia;
import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertAll;

import com.yeogidam.support.JdbcTestSupport;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

@Import(SharedMediaDao.class)
class SharedMediaDaoTest extends JdbcTestSupport {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private SharedMediaDao sharedMediaDao;

    @Test
    void 공유_미디어가_회원의_소유인지_확인한다() {
        // given
        insertKakaoMember(jdbcTemplate, 7L, "shared-media-owner", "shared-media-owner",
                "shared-media-owner@example.com", "https://img.example.com/shared-media-owner");
        insertKakaoMember(jdbcTemplate, 8L, "shared-media-other", "shared-media-other",
                "shared-media-other@example.com", "https://img.example.com/shared-media-other");
        insertMedia(jdbcTemplate, 7L, "게시글", "media.jpg", "@author");
        insertSharedMedia(jdbcTemplate, 7L, 7L, 7L,
                Instant.parse("2026-09-17T10:00:00Z"));

        // when & then
        assertAll(
                () -> assertThat(sharedMediaDao.existsByMemberIdAndSharedMediaId(7L, 7L)).isTrue(),
                () -> assertThat(sharedMediaDao.existsByMemberIdAndSharedMediaId(8L, 7L)).isFalse(),
                () -> assertThat(sharedMediaDao.existsByMemberIdAndSharedMediaId(7L, 99L)).isFalse()
        );
    }

    @Test
    void 히스토리_목록을_회원별로_공유_시각과_ID_내림차순으로_조회하고_요약_필드를_매핑한다() {
        // given
        insertKakaoMember(jdbcTemplate, 5L, "share-dao-list-user", "share-dao-list-user",
                "share-dao-list-user@example.com", "https://img.example.com/share-dao-list-user");
        insertKakaoMember(jdbcTemplate, 6L, "share-dao-list-other", "share-dao-list-other",
                "share-dao-list-other@example.com", "https://img.example.com/share-dao-list-other");

        insertMedia(jdbcTemplate, 4L, "성공 게시글", "succeeded.jpg", "@succeeded");
        insertMediaWithStatus(5L, null, null, null, "FAILED", "CONTENT_UNAVAILABLE");
        insertMedia(jdbcTemplate, 6L, "다른 회원 게시글", "other.jpg", "@other");

        insertSharedMedia(jdbcTemplate, 4L, 5L, 4L,
                Instant.parse("2026-09-17T10:00:00Z"));
        insertSharedMedia(jdbcTemplate, 5L, 5L, 5L,
                Instant.parse("2026-09-17T10:00:00Z"));
        insertSharedMedia(jdbcTemplate, 6L, 6L, 6L,
                Instant.parse("2026-09-17T11:00:00Z"));

        // when
        List<ShareHistoryProjection> shares = sharedMediaDao.findShareHistory(5L).page();

        // then
        assertThat(shares)
                .extracting(ShareHistoryProjection::sharedMediaId)
                .containsExactly(5L, 4L);

        ShareHistoryProjection failed = shares.getFirst();
        ShareHistoryProjection succeeded = shares.getLast();
        assertAll(
                () -> assertThat(failed.thumbnailKey()).isNull(),
                () -> assertThat(failed.caption()).isNull(),
                () -> assertThat(failed.author()).isNull(),
                () -> assertThat(failed.extractionStatus()).isEqualTo("FAILED"),
                () -> assertThat(failed.failureReason()).isEqualTo("CONTENT_UNAVAILABLE"),
                () -> assertThat(failed.sharedUrl())
                        .isEqualTo("https://www.instagram.com/reel/fixture-5/"),
                () -> assertThat(succeeded.thumbnailKey()).isEqualTo("succeeded.jpg"),
                () -> assertThat(succeeded.caption()).isEqualTo("성공 게시글"),
                () -> assertThat(succeeded.author()).isEqualTo("@succeeded"),
                () -> assertThat(succeeded.extractionStatus()).isEqualTo("SUCCEEDED"),
                () -> assertThat(succeeded.failureReason()).isNull(),
                () -> assertThat(succeeded.sharedUrl())
                        .isEqualTo("https://www.instagram.com/reel/fixture-4/")
        );
    }

    @Test
    void 히스토리가_없으면_빈_목록을_반환한다() {
        // when
        List<ShareHistoryProjection> shares = sharedMediaDao.findShareHistory(7L).shares();

        // then
        assertThat(shares).isEmpty();
    }

    @Test
    void 첫_페이지는_다음_페이지가_있는지_알_수_있게_최신순으로_51건을_읽는다() {
        // given: 1초 간격으로 공유한 기록이 55건 있다
        insertKakaoMember(jdbcTemplate, 8L, "share-dao-page-user", null, null, null);
        insertMedia(jdbcTemplate, 8L, "페이지 게시글", "page.jpg", "@page");
        insertSharesOneSecondApart(8L, 8L, 55);

        // when
        List<ShareHistoryProjection> shares = sharedMediaDao.findShareHistory(8L).shares();

        // then: 최신인 55부터 51건을 읽고, 52번째인 4부터는 읽지 않는다
        assertAll(
                () -> assertThat(shares).hasSize(51),
                () -> assertThat(shares.getFirst().sharedMediaId()).isEqualTo(55L),
                () -> assertThat(shares.getLast().sharedMediaId()).isEqualTo(5L)
        );
    }

    @Test
    void 커서보다_오래된_내_공유만_최신순으로_읽는다() {
        // given: 공유 3, 4, 5는 공유 시각이 같고, 공유 6은 다른 회원의 공유다
        insertKakaoMember(jdbcTemplate, 9L, "share-dao-cursor-user", null, null, null);
        insertKakaoMember(jdbcTemplate, 10L, "share-dao-cursor-other", null, null, null);
        insertMedia(jdbcTemplate, 9L, "커서 게시글", "cursor.jpg", "@cursor");
        Instant sameTime = Instant.parse("2026-09-20T03:00:00.123456Z");
        insertSharedMedia(jdbcTemplate, 1L, 9L, 9L, sameTime.minusSeconds(2));
        insertSharedMedia(jdbcTemplate, 2L, 9L, 9L, sameTime.minusNanos(1_000));
        insertSharedMedia(jdbcTemplate, 3L, 9L, 9L, sameTime);
        insertSharedMedia(jdbcTemplate, 4L, 9L, 9L, sameTime);
        insertSharedMedia(jdbcTemplate, 5L, 9L, 9L, sameTime);
        insertSharedMedia(jdbcTemplate, 6L, 10L, 9L, sameTime.minusSeconds(1));

        // when: 공유 4까지 본 뒤 다음 페이지를 읽는다
        List<ShareHistoryProjection> shares = sharedMediaDao
                .findShareHistoryBefore(9L, new ShareHistoryCursor(sameTime, 4L))
                .shares();

        // then: 시각이 같은 공유 3과 1마이크로초 이른 공유 2는 빠지지 않고, 다른 회원의 공유 6은 섞이지 않는다
        assertThat(shares)
                .extracting(ShareHistoryProjection::sharedMediaId)
                .containsExactly(3L, 2L, 1L);
    }

    private void insertSharesOneSecondApart(Long memberId, Long mediaId, int count) {
        Instant base = Instant.parse("2026-09-20T03:00:00Z");
        for (long id = 1; id <= count; id++) {
            insertSharedMedia(jdbcTemplate, id, memberId, mediaId, base.plusSeconds(id));
        }
    }

    private void insertMediaWithStatus(
            Long mediaId,
            String caption,
            String thumbnailKey,
            String author,
            String extractionStatus,
            String failureReason
    ) {
        jdbcTemplate.update("""
                INSERT INTO media (
                    id, media_shortcode, caption, thumbnail_key, author,
                    extraction_status, failure_reason, extraction_version, source_type
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'SEEDED')
                """, mediaId, "fixture-media-" + mediaId, caption, thumbnailKey, author,
                extractionStatus, failureReason);
    }
}
