package com.yeogidam.media.share.repository;

import static com.yeogidam.support.fixture.sql.MediaSqlFixture.insertExtractingMedia;
import static com.yeogidam.support.fixture.sql.MediaSqlFixture.insertFailedMedia;
import static com.yeogidam.support.fixture.sql.MediaSqlFixture.insertMedia;
import static com.yeogidam.support.fixture.sql.MemberSqlFixture.insertKakaoMember;
import static com.yeogidam.support.fixture.sql.SharedMediaSqlFixture.insertSharedMedia;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertAll;

import com.yeogidam.media.extraction.domain.ExtractionFailureReason;
import com.yeogidam.media.extraction.domain.ExtractionSnapshot;
import com.yeogidam.media.extraction.domain.ExtractionStatus;
import com.yeogidam.media.extraction.domain.MediaSourceType;
import com.yeogidam.media.instagram.domain.InstagramUrl;
import com.yeogidam.media.share.domain.ExtractionRetrySource;
import com.yeogidam.media.share.domain.SharedInstagramMedia;
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
    void 같은_회원이_같은_미디어를_재공유하면_원본_URL을_보존한_새_공유_이력이_생긴다() {
        // given
        insertKakaoMember(jdbcTemplate, 1L, "share-save-owner", null, null, null);
        insertFailedMedia(jdbcTemplate, 1L, 3, ExtractionFailureReason.PROCESSING_FAILED);
        String firstUrl = "https://www.instagram.com/reel/fixture-media-1/?igsh=first";
        String secondUrl = "https://www.instagram.com/reel/fixture-media-1/?igsh=second";

        // when
        Long firstId = sharedMediaDao.save(new SharedInstagramMedia(1L, 1L, new InstagramUrl(firstUrl)));
        Long secondId = sharedMediaDao.save(new SharedInstagramMedia(1L, 1L, new InstagramUrl(secondUrl)));

        // then
        List<ShareHistoryProjection> shares = sharedMediaDao.findShareHistory(1L).shares();
        assertAll(
                () -> assertThat(firstId).isPositive(),
                () -> assertThat(secondId).isGreaterThan(firstId),
                () -> assertThat(shares)
                        .extracting(ShareHistoryProjection::sharedMediaId)
                        .containsExactly(secondId, firstId),
                () -> assertThat(shares)
                        .extracting(ShareHistoryProjection::sharedUrl)
                        .containsExactly(secondUrl, firstUrl),
                () -> assertThat(jdbcTemplate.queryForObject(
                        "SELECT media_id FROM shared_media WHERE id = ?", Long.class, secondId))
                        .isEqualTo(1L),
                () -> assertThat(readExtractionState(firstId))
                        .isEqualTo(new ExtractionState("FAILED", "PROCESSING_FAILED", 3)),
                () -> assertThat(readExtractionState(secondId))
                        .isEqualTo(new ExtractionState("FAILED", "PROCESSING_FAILED", 3))
        );
    }

    @Test
    void 공유할_미디어가_없으면_예외가_발생한다() {
        // given
        insertKakaoMember(jdbcTemplate, 1L, "share-save-missing-media", null, null, null);
        SharedInstagramMedia sharedMedia = new SharedInstagramMedia(
                1L, 999L, new InstagramUrl("https://www.instagram.com/reel/missing-media/"));

        // when & then
        assertThatThrownBy(() -> sharedMediaDao.save(sharedMedia))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void 회원_ID와_공유_이력_ID로_공유_이력에_기록된_스냅숏을_조회한다() {
        // given
        insertKakaoMember(jdbcTemplate, 51L, "retry-source-owner", null, null, null);
        insertKakaoMember(jdbcTemplate, 52L, "retry-source-other", null, null, null);
        insertMedia(jdbcTemplate, 51L, "FAILED", "UNEXPECTED", 3, "EXTRACTED");
        String sharedUrl = "https://www.instagram.com/reel/retry-source/?igsh=source";
        insertSharedMedia(jdbcTemplate, 510L, 51L, 51L, sharedUrl,
                Instant.parse("2026-10-01T10:00:00Z"));
        jdbcTemplate.update("""
                UPDATE media
                SET extraction_status = 'SUCCEEDED', failure_reason = NULL, extraction_version = 4
                WHERE id = ?
                """, 51L);

        // when
        ExtractionRetrySource source = sharedMediaDao.findRetrySource(51L, 510L)
                .orElseThrow();

        // then
        assertAll(
                () -> assertThat(source).isEqualTo(new ExtractionRetrySource(
                                51L,
                                new InstagramUrl(sharedUrl),
                                new ExtractionSnapshot(ExtractionStatus.FAILED, ExtractionFailureReason.UNEXPECTED, 3,
                                        MediaSourceType.EXTRACTED)
                        )),
                () -> assertThat(sharedMediaDao.findRetrySource(52L, 510L)).isEmpty(),
                () -> assertThat(sharedMediaDao.findRetrySource(51L, 511L)).isEmpty()
        );
    }

    @Test
    void 회원과_미디어로_분석_중인_최신_공유_이력을_조회한다() {
        // given
        insertKakaoMember(jdbcTemplate, 60L, "extracting-share-owner", null, null, null);
        insertKakaoMember(jdbcTemplate, 61L, "extracting-share-other", null, null, null);
        insertExtractingMedia(jdbcTemplate, 60L);
        insertExtractingMedia(jdbcTemplate, 61L);
        insertMedia(jdbcTemplate, 62L, "FAILED", "UNEXPECTED", 2, "EXTRACTED");
        Instant sharedAt = Instant.parse("2026-10-01T10:00:00Z");
        insertSharedMedia(jdbcTemplate, 601L, 60L, 60L, sharedAt);
        insertSharedMedia(jdbcTemplate, 602L, 60L, 60L, sharedAt.plusSeconds(1));
        insertSharedMedia(jdbcTemplate, 603L, 61L, 60L, sharedAt.plusSeconds(2));
        insertSharedMedia(jdbcTemplate, 604L, 60L, 61L, sharedAt.plusSeconds(3));
        insertSharedMedia(jdbcTemplate, 605L, 60L, 62L, sharedAt.plusSeconds(4));

        // when & then
        assertAll(
                () -> assertThat(sharedMediaDao.findExtractingShareId(60L, 60L)).contains(602L),
                () -> assertThat(sharedMediaDao.findExtractingShareId(61L, 60L)).contains(603L),
                () -> assertThat(sharedMediaDao.findExtractingShareId(60L, 61L)).contains(604L),
                () -> assertThat(sharedMediaDao.findExtractingShareId(60L, 62L)).isEmpty(),
                () -> assertThat(sharedMediaDao.findExtractingShareId(99L, 99L)).isEmpty()
        );
    }

    @Test
    void 대상_미디어의_회원별_최대_공유_ID가_분석_중인_이력만_공유_ID_오름차순으로_조회한다() {
        // given: 시각과 삽입 순서가 달라도 ID가 가장 큰 공유를 회원별로 선택한다.
        insertKakaoMember(jdbcTemplate, 1L, "share-latest-owner", null, null, null);
        insertKakaoMember(jdbcTemplate, 2L, "share-latest-other", null, null, null);
        insertKakaoMember(jdbcTemplate, 3L, "share-latest-failed", null, null, null);
        insertKakaoMember(jdbcTemplate, 4L, "share-latest-succeeded", null, null, null);
        insertExtractingMedia(jdbcTemplate, 1L);
        insertMedia(jdbcTemplate, 2L, null, null, null);
        Instant now = Instant.parse("2026-10-01T10:00:00Z");
        insertSharedMedia(jdbcTemplate, 9L, 1L, 1L, now.minusSeconds(1));
        insertSharedMedia(jdbcTemplate, 3L, 1L, 1L, now);
        insertSharedMedia(jdbcTemplate, 7L, 2L, 1L, now);
        insertSharedMedia(jdbcTemplate, 5L, 2L, 1L, now);
        insertSharedMedia(jdbcTemplate, 10L, 1L, 2L, now.plusSeconds(1));
        ExtractionSnapshot failed = new ExtractionSnapshot(
                ExtractionStatus.FAILED, ExtractionFailureReason.UNEXPECTED, 1, MediaSourceType.EXTRACTED);
        ExtractionSnapshot succeeded = new ExtractionSnapshot(
                ExtractionStatus.SUCCEEDED, null, 1, MediaSourceType.EXTRACTED);
        insertSharedMedia(jdbcTemplate, 1L, 1L, 1L, now, failed);
        insertSharedMedia(jdbcTemplate, 2L, 2L, 1L, now, succeeded);
        insertSharedMedia(jdbcTemplate, 11L, 3L, 1L, now);
        insertSharedMedia(jdbcTemplate, 12L, 4L, 1L, now);
        insertSharedMedia(jdbcTemplate, 13L, 3L, 1L, now, failed);
        insertSharedMedia(jdbcTemplate, 14L, 4L, 1L, now, succeeded);

        // when
        List<SharedMediaOwnerProjection> shares = sharedMediaDao.findLatestSharesByMediaId(1L);

        // then
        assertThat(shares).containsExactly(
                new SharedMediaOwnerProjection(7L, 2L),
                new SharedMediaOwnerProjection(9L, 1L)
        );
    }

    @Test
    void 대상_미디어의_공유가_없으면_회원별_최신_공유_목록은_비어_있다() {
        // given
        insertKakaoMember(jdbcTemplate, 1L, "share-latest-empty", null, null, null);
        insertMedia(jdbcTemplate, 1L, null, null, null);
        insertMedia(jdbcTemplate, 2L, null, null, null);
        insertSharedMedia(jdbcTemplate, 1L, 1L, 2L, Instant.parse("2026-10-01T10:00:00Z"));

        // when & then
        assertAll(
                () -> assertThat(sharedMediaDao.findLatestSharesByMediaId(1L)).isEmpty(),
                () -> assertThat(sharedMediaDao.findLatestSharesByMediaId(999L)).isEmpty()
        );
    }

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
    void 회원의_공유_이력이면_분석_상태를_돌려주고_남의_것이거나_없으면_빈_Optional을_반환한다() {
        // given
        insertKakaoMember(jdbcTemplate, 7L, "status-owner", null, null, null);
        insertKakaoMember(jdbcTemplate, 8L, "status-other", null, null, null);
        insertFailedMedia(jdbcTemplate, 7L, 1, ExtractionFailureReason.UNEXPECTED);
        insertSharedMedia(jdbcTemplate, 7L, 7L, 7L, Instant.parse("2026-10-06T10:00:00Z"));

        // when & then
        assertAll(
                () -> assertThat(sharedMediaDao.findStatusByMemberAndSharedMediaId(7L, 7L))
                        .contains(ExtractionStatus.FAILED),
                () -> assertThat(sharedMediaDao.findStatusByMemberAndSharedMediaId(8L, 7L))
                        .isEmpty(),
                () -> assertThat(sharedMediaDao.findStatusByMemberAndSharedMediaId(7L, 99L))
                        .isEmpty()
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
        insertMedia(jdbcTemplate, 5L, "FAILED", "CONTENT_UNAVAILABLE", 1, "EXTRACTED");
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

    @Test
    void 분석이_끝나면_EXTRACTING인_이력에만_미디어의_분석_결과를_복사하고_FAILED인_이력은_그대로_둔다() {
        // given
        insertKakaoMember(jdbcTemplate, 9L, "pending-share-owner", null, null, null);
        insertKakaoMember(jdbcTemplate, 10L, "pending-share-other", null, null, null);
        insertExtractingMedia(jdbcTemplate, 9L);
        insertSharedMedia(jdbcTemplate, 91L, 9L, 9L, Instant.parse("2026-10-01T10:00:00Z"));
        insertSharedMedia(jdbcTemplate, 92L, 9L, 9L, Instant.parse("2026-10-02T10:00:00Z"));
        insertSharedMedia(jdbcTemplate, 93L, 10L, 9L, Instant.parse("2026-10-03T10:00:00Z"));
        jdbcTemplate.update("""
                UPDATE shared_media
                SET extraction_status = 'FAILED', failure_reason = 'UNEXPECTED'
                WHERE id = ?
                """, 91L);
        jdbcTemplate.update("""
                UPDATE media
                SET extraction_status = 'SUCCEEDED', failure_reason = NULL, extraction_version = 2
                WHERE id = ?
                """, 9L);

        // when
        sharedMediaDao.updatePendingExtractions(9L);

        // then: 이미 실패한 공유 이력은 보존하고 대기 중인 이력만 완료 상태를 받는다.
        assertAll(
                () -> assertThat(readExtractionState(91L))
                        .isEqualTo(new ExtractionState("FAILED", "UNEXPECTED", 1)),
                () -> assertThat(readExtractionState(92L))
                        .isEqualTo(new ExtractionState("SUCCEEDED", null, 2)),
                () -> assertThat(readExtractionState(93L))
                        .isEqualTo(new ExtractionState("SUCCEEDED", null, 2))
        );
    }

    private ExtractionState readExtractionState(Long sharedMediaId) {
        return jdbcTemplate.queryForObject("""
                SELECT extraction_status, failure_reason, extraction_version
                FROM shared_media
                WHERE id = ?
                """, (resultSet, rowNumber) -> new ExtractionState(
                resultSet.getString("extraction_status"),
                resultSet.getString("failure_reason"),
                resultSet.getInt("extraction_version")
        ), sharedMediaId);
    }

    private record ExtractionState(String status, String failureReason, int version) {
    }
}
