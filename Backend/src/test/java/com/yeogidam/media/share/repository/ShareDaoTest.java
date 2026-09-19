package com.yeogidam.media.share.repository;

import static com.yeogidam.support.PlaceCandidateSqlFixture.insertMember;
import static com.yeogidam.support.PlaceCandidateSqlFixture.insertMedia;
import static com.yeogidam.support.PlaceCandidateSqlFixture.insertSharedMedia;
import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertAll;

import com.yeogidam.support.JdbcTestSupport;
import java.sql.Timestamp;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

@Import(ShareDao.class)
class ShareDaoTest extends JdbcTestSupport {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ShareDao shareDao;

    @Test
    void 본인_공유_결과를_모든_필드로_매핑한다() {
        // given
        insertMember(jdbcTemplate, 910020L, "share-dao-user");
        insertMediaWithStatus(
                920020L,
                "성수동 카페 모음",
                "https://img.example.com/media.jpg",
                "@seongsu",
                "SUCCEEDED",
                null
        );
        insertSharedMedia(jdbcTemplate, 930020L, 910020L, 920020L,
                Timestamp.valueOf("2026-09-17 10:00:00"));

        // when
        ShareHistoryDetailProjection result = shareDao.findShareHistoryDetail(910020L, 930020L).orElseThrow();

        // then
        assertAll(
                () -> assertThat(result.sharedMediaId()).isEqualTo(930020L),
                () -> assertThat(result.thumbnailUrl()).isEqualTo("https://img.example.com/media.jpg"),
                () -> assertThat(result.caption()).isEqualTo("성수동 카페 모음"),
                () -> assertThat(result.author()).isEqualTo("@seongsu"),
                () -> assertThat(result.extractionStatus()).isEqualTo("SUCCEEDED"),
                () -> assertThat(result.failureReason()).isNull(),
                () -> assertThat(result.originalUrl())
                        .isEqualTo("https://www.instagram.com/reel/fixture-930020/")
        );
    }

    @Test
    void 게시글_접근_실패_결과의_게시글_정보_null을_매핑한다() {
        // given
        insertMember(jdbcTemplate, 910021L, "share-dao-content-unavailable-user");
        insertMediaWithStatus(920021L, null, null, null, "FAILED", "CONTENT_UNAVAILABLE");
        insertSharedMedia(jdbcTemplate, 930021L, 910021L, 920021L,
                Timestamp.valueOf("2026-09-17 10:00:00"));

        // when
        ShareHistoryDetailProjection result = shareDao.findShareHistoryDetail(910021L, 930021L).orElseThrow();

        // then
        assertAll(
                () -> assertThat(result.thumbnailUrl()).isNull(),
                () -> assertThat(result.caption()).isNull(),
                () -> assertThat(result.author()).isNull(),
                () -> assertThat(result.extractionStatus()).isEqualTo("FAILED"),
                () -> assertThat(result.failureReason()).isEqualTo("CONTENT_UNAVAILABLE")
        );
    }

    @Test
    void 다른_회원의_공유_결과_또는_존재하지_않는_공유_결과는_빈_Optional을_반환한다() {
        // given
        insertMember(jdbcTemplate, 910022L, "share-dao-owner");
        insertMember(jdbcTemplate, 910023L, "share-dao-other");
        insertMedia(jdbcTemplate, 920022L, "게시글", "https://img.example.com/media.jpg", "@author");
        insertSharedMedia(jdbcTemplate, 930022L, 910022L, 920022L,
                Timestamp.valueOf("2026-09-17 10:00:00"));

        // when
        Optional<ShareHistoryDetailProjection> otherMemberResult = shareDao.findShareHistoryDetail(910023L, 930022L);
        Optional<ShareHistoryDetailProjection> missingResult = shareDao.findShareHistoryDetail(910022L, 999999L);

        // then
        assertThat(otherMemberResult).isEmpty();
        assertThat(missingResult).isEmpty();
    }

    @Test
    void 히스토리_목록을_회원별로_공유_시각과_ID_내림차순으로_조회하고_요약_필드를_매핑한다() {
        // given
        insertMember(jdbcTemplate, 910024L, "share-dao-list-user");
        insertMember(jdbcTemplate, 910025L, "share-dao-list-other");

        insertMedia(jdbcTemplate, 920024L, "성공 게시글", "https://img.example.com/succeeded.jpg", "@succeeded");
        insertMediaWithStatus(920025L, null, null, null, "FAILED", "CONTENT_UNAVAILABLE");
        insertMedia(jdbcTemplate, 920026L, "다른 회원 게시글", "https://img.example.com/other.jpg", "@other");

        insertSharedMedia(jdbcTemplate, 930024L, 910024L, 920024L,
                Timestamp.valueOf("2026-09-17 10:00:00"));
        insertSharedMedia(jdbcTemplate, 930025L, 910024L, 920025L,
                Timestamp.valueOf("2026-09-17 10:00:00"));
        insertSharedMedia(jdbcTemplate, 930026L, 910025L, 920026L,
                Timestamp.valueOf("2026-09-17 11:00:00"));

        // when
        List<ShareProjection> shares = shareDao.findShares(910024L);

        // then
        assertThat(shares)
                .extracting(ShareProjection::sharedMediaId)
                .containsExactly(930025L, 930024L);

        ShareProjection failed = shares.getFirst();
        ShareProjection succeeded = shares.getLast();
        assertAll(
                () -> assertThat(failed.thumbnailUrl()).isNull(),
                () -> assertThat(failed.caption()).isNull(),
                () -> assertThat(failed.author()).isNull(),
                () -> assertThat(failed.extractionStatus()).isEqualTo("FAILED"),
                () -> assertThat(failed.originalUrl())
                        .isEqualTo("https://www.instagram.com/reel/fixture-930025/"),
                () -> assertThat(succeeded.thumbnailUrl())
                        .isEqualTo("https://img.example.com/succeeded.jpg"),
                () -> assertThat(succeeded.caption()).isEqualTo("성공 게시글"),
                () -> assertThat(succeeded.author()).isEqualTo("@succeeded"),
                () -> assertThat(succeeded.extractionStatus()).isEqualTo("SUCCEEDED"),
                () -> assertThat(succeeded.originalUrl())
                        .isEqualTo("https://www.instagram.com/reel/fixture-930024/")
        );
    }

    @Test
    void 히스토리가_없으면_빈_목록을_반환한다() {
        // when
        List<ShareProjection> shares = shareDao.findShares(910027L);

        // then
        assertThat(shares).isEmpty();
    }

    private void insertMediaWithStatus(
            Long mediaId,
            String caption,
            String thumbnailUrl,
            String author,
            String extractionStatus,
            String failureReason
    ) {
        jdbcTemplate.update("""
                INSERT INTO media (
                    id, media_shortcode, caption, thumbnail_url, author,
                    extraction_status, failure_reason, extraction_version, source_type
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'SEEDED')
                """, mediaId, "fixture-media-" + mediaId, caption, thumbnailUrl, author,
                extractionStatus, failureReason);
    }
}
