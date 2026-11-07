package com.yeogidam.media.share.repository;

import static com.yeogidam.support.fixture.sql.MediaPlaceSqlFixture.insertMediaPlace;
import static com.yeogidam.support.fixture.sql.MediaSqlFixture.insertExtractingMedia;
import static com.yeogidam.support.fixture.sql.MediaSqlFixture.insertFailedMedia;
import static com.yeogidam.support.fixture.sql.MediaSqlFixture.insertMedia;
import static com.yeogidam.support.fixture.sql.MemberSqlFixture.insertKakaoMember;
import static com.yeogidam.support.fixture.sql.PlaceSqlFixture.insertPlaceWithRequiredColumnsOnly;
import static com.yeogidam.support.fixture.sql.SavedPlaceShareSqlFixture.insertSavedPlaceShare;
import static com.yeogidam.support.fixture.sql.SavedPlaceSqlFixture.insertSavedPlace;
import static com.yeogidam.support.fixture.sql.SharedMediaReportSqlFixture.insertReport;
import static com.yeogidam.support.fixture.sql.SharedMediaSqlFixture.insertDeletedSharedMedia;
import static com.yeogidam.support.fixture.sql.SharedMediaSqlFixture.insertSharedMedia;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.tuple;
import static org.junit.jupiter.api.Assertions.assertAll;

import com.yeogidam.media.extraction.domain.ExtractionFailureReason;
import com.yeogidam.media.extraction.domain.ExtractionSnapshot;
import com.yeogidam.media.extraction.domain.ExtractionStatus;
import com.yeogidam.media.extraction.domain.MediaSourceType;
import com.yeogidam.media.instagram.domain.InstagramUrl;
import com.yeogidam.media.share.domain.ExtractionRetrySource;
import com.yeogidam.media.share.domain.SharedInstagramMedia;
import com.yeogidam.support.JdbcTestSupport;
import java.math.BigDecimal;
import java.sql.Timestamp;
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
    void 회원이_게시물을_공유한_이력이_있으면_가장_나중_이력의_ID를_조회한다() {
        // given
        insertKakaoMember(jdbcTemplate, 70L, "latest-share-owner", null, null, null);
        insertKakaoMember(jdbcTemplate, 71L, "latest-share-other", null, null, null);
        insertMedia(jdbcTemplate, 70L, null, null, null);
        insertMedia(jdbcTemplate, 71L, null, null, null);
        Instant sharedAt = Instant.parse("2026-10-08T10:00:00Z");
        insertSharedMedia(jdbcTemplate, 701L, 70L, 70L, sharedAt);
        insertSharedMedia(jdbcTemplate, 702L, 70L, 70L, sharedAt.plusSeconds(1));
        insertSharedMedia(jdbcTemplate, 703L, 71L, 70L, sharedAt.plusSeconds(2));
        insertSharedMedia(jdbcTemplate, 704L, 70L, 71L, sharedAt.plusSeconds(3));

        // when & then
        assertAll(
                () -> assertThat(sharedMediaDao.findShareIdByMemberAndMedia(70L, 70L)).contains(702L),
                () -> assertThat(sharedMediaDao.findShareIdByMemberAndMedia(71L, 70L)).contains(703L),
                () -> assertThat(sharedMediaDao.findShareIdByMemberAndMedia(70L, 71L)).contains(704L),
                () -> assertThat(sharedMediaDao.findShareIdByMemberAndMedia(71L, 71L)).isEmpty(),
                () -> assertThat(sharedMediaDao.findShareIdByMemberAndMedia(99L, 70L)).isEmpty()
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
    void 재시도가_이어받을_분석_중인_공유에서_지운_공유는_빠진다() {
        // given
        insertKakaoMember(jdbcTemplate, 60L, "extracting-deleted-owner", null, null, null);
        insertExtractingMedia(jdbcTemplate, 60L);
        Instant sharedAt = Instant.parse("2026-10-01T10:00:00Z");
        insertDeletedSharedMedia(jdbcTemplate, 601L, 60L, 60L, sharedAt, sharedAt.plusSeconds(1));

        // when & then
        assertThat(sharedMediaDao.findExtractingShareId(60L, 60L)).isEmpty();
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
                .findShareHistoryBefore(9L, new SharedMediaCursor(sameTime, 4L))
                .shares();

        // then: 시각이 같은 공유 3과 1마이크로초 이른 공유 2는 빠지지 않고, 다른 회원의 공유 6은 섞이지 않는다
        assertThat(shares)
                .extracting(ShareHistoryProjection::sharedMediaId)
                .containsExactly(3L, 2L, 1L);
    }

    @Test
    void 히스토리는_공유마다_제보했는지를_읽는다() {
        // given: 회원 1이 실패한 게시물 1을 공유 1과 공유 2로 두 번 공유했고, 공유 1만 제보했다.
        insertKakaoMember(jdbcTemplate, 1L, "history-reported-owner", null, null, null);
        insertFailedMedia(jdbcTemplate, 1L, 1, ExtractionFailureReason.PLACE_NOT_EXTRACTED);
        insertSharedMedia(jdbcTemplate, 1L, 1L, 1L, Instant.parse("2026-11-01T10:00:00Z"));
        insertSharedMedia(jdbcTemplate, 2L, 1L, 1L, Instant.parse("2026-11-01T11:00:00Z"));
        insertReport(jdbcTemplate, 1L, 1L, Instant.parse("2026-11-01T10:30:00Z"));

        // when
        List<ShareHistoryProjection> shares = sharedMediaDao.findShareHistory(1L).page();

        // then
        assertThat(shares)
                .extracting(ShareHistoryProjection::sharedMediaId, ShareHistoryProjection::reported)
                .containsExactly(tuple(2L, false), tuple(1L, true));
    }

    @Test
    void 지운_공유도_히스토리에서_제보_여부를_그대로_읽는다() {
        // given: 회원 1이 실패한 게시물 1의 공유 1을 제보한 뒤 보관함에서 지웠다.
        insertKakaoMember(jdbcTemplate, 1L, "history-deleted-reported-owner", null, null, null);
        insertFailedMedia(jdbcTemplate, 1L, 1, ExtractionFailureReason.PLACE_NOT_EXTRACTED);
        insertDeletedSharedMedia(jdbcTemplate, 1L, 1L, 1L,
                Instant.parse("2026-11-01T10:00:00Z"), Instant.parse("2026-11-02T10:00:00Z"));
        insertReport(jdbcTemplate, 1L, 1L, Instant.parse("2026-11-01T10:30:00Z"));

        // when
        List<ShareHistoryProjection> shares = sharedMediaDao.findShareHistory(1L).page();

        // then
        assertThat(shares)
                .extracting(ShareHistoryProjection::sharedMediaId, ShareHistoryProjection::reported)
                .containsExactly(tuple(1L, true));
    }

    @Test
    void 히스토리_다음_페이지도_첫_페이지처럼_제보_여부를_읽는다() {
        // given: 회원 1이 실패한 게시물 1을 공유 1, 2, 3으로 세 번 공유해 공유 1만 제보했고, 공유 3까지 본 뒤 다음 페이지를 읽는다.
        insertKakaoMember(jdbcTemplate, 1L, "history-next-page-owner", null, null, null);
        insertFailedMedia(jdbcTemplate, 1L, 1, ExtractionFailureReason.PLACE_NOT_EXTRACTED);
        Instant base = Instant.parse("2026-11-01T10:00:00Z");
        insertSharedMedia(jdbcTemplate, 1L, 1L, 1L, base);
        insertSharedMedia(jdbcTemplate, 2L, 1L, 1L, base.plusSeconds(1));
        insertSharedMedia(jdbcTemplate, 3L, 1L, 1L, base.plusSeconds(2));
        insertReport(jdbcTemplate, 1L, 1L, base.plusSeconds(3));

        // when
        List<ShareHistoryProjection> shares = sharedMediaDao
                .findShareHistoryBefore(1L, new SharedMediaCursor(base.plusSeconds(2), 3L))
                .shares();

        // then
        assertThat(shares)
                .extracting(ShareHistoryProjection::sharedMediaId, ShareHistoryProjection::reported)
                .containsExactly(tuple(2L, false), tuple(1L, true));
    }

    @Test
    void 지운_공유는_히스토리에서_지운_시각을_읽고_지우지_않은_공유는_null로_읽는다() {
        // given: 회원 1이 게시물 1을 공유 1로, 게시물 2를 공유 2로 공유했고, 공유 1만 보관함에서 지웠다.
        insertKakaoMember(jdbcTemplate, 1L, "history-deleted-at-owner", null, null, null);
        insertMedia(jdbcTemplate, 1L, "지운 게시글", "deleted.jpg", "@deleted");
        insertMedia(jdbcTemplate, 2L, "남은 게시글", "kept.jpg", "@kept");
        Instant deletedAt = Instant.parse("2026-11-02T10:00:00.123456Z");
        insertDeletedSharedMedia(jdbcTemplate, 1L, 1L, 1L, Instant.parse("2026-11-01T10:00:00Z"), deletedAt);
        insertSharedMedia(jdbcTemplate, 2L, 1L, 2L, Instant.parse("2026-11-01T11:00:00Z"));

        // when
        List<ShareHistoryProjection> shares = sharedMediaDao.findShareHistory(1L).page();

        // then
        assertThat(shares)
                .extracting(ShareHistoryProjection::sharedMediaId, ShareHistoryProjection::deletedAt)
                .containsExactly(tuple(2L, null), tuple(1L, deletedAt));
    }

    @Test
    void 히스토리_다음_페이지도_첫_페이지처럼_지운_시각을_읽는다() {
        // given: 회원 1이 게시물 1을 공유 1로, 게시물 2를 공유 2와 공유 3으로 공유해 공유 1만 지웠고, 공유 3까지 본 뒤 다음 페이지를 읽는다.
        insertKakaoMember(jdbcTemplate, 1L, "history-next-page-deleted-at-owner", null, null, null);
        insertMedia(jdbcTemplate, 1L, "지운 게시글", "deleted.jpg", "@deleted");
        insertMedia(jdbcTemplate, 2L, "남은 게시글", "kept.jpg", "@kept");
        Instant base = Instant.parse("2026-11-01T10:00:00Z");
        Instant deletedAt = Instant.parse("2026-11-02T10:00:00.123456Z");
        insertDeletedSharedMedia(jdbcTemplate, 1L, 1L, 1L, base, deletedAt);
        insertSharedMedia(jdbcTemplate, 2L, 1L, 2L, base.plusSeconds(1));
        insertSharedMedia(jdbcTemplate, 3L, 1L, 2L, base.plusSeconds(2));

        // when
        List<ShareHistoryProjection> shares = sharedMediaDao
                .findShareHistoryBefore(1L, new SharedMediaCursor(base.plusSeconds(2), 3L))
                .shares();

        // then
        assertThat(shares)
                .extracting(ShareHistoryProjection::sharedMediaId, ShareHistoryProjection::deletedAt)
                .containsExactly(tuple(2L, null), tuple(1L, deletedAt));
    }

    private void insertSharesOneSecondApart(Long memberId, Long mediaId, int count) {
        Instant base = Instant.parse("2026-09-20T03:00:00Z");
        for (long id = 1; id <= count; id++) {
            insertSharedMedia(jdbcTemplate, id, memberId, mediaId, base.plusSeconds(id));
        }
    }

    @Test
    void 장소를_모두_저장_해제해_보관함_연결이_없는_게시물도_보관함_게시물로_읽는다() {
        // given: 회원 11은 장소가 나온 게시물 11을 공유 1로 공유했고, 장소를 모두 저장 해제해 보관함 연결이 없다
        insertKakaoMember(jdbcTemplate, 11L, "saved-media-unlinked-owner", null, null, null);
        insertMedia(jdbcTemplate, 11L, "성수 카페 모음", "saved.jpg", "@saved");
        insertSavedMediaPlace(1L, "saved-media-unlinked-place");
        insertMediaPlace(jdbcTemplate, 1L, 11L, 1L);
        insertSharedMedia(jdbcTemplate, 1L, 11L, 11L, Instant.parse("2026-11-01T10:00:00Z"));

        // when
        List<SavedMediaProjection> shares = sharedMediaDao.findSavedMedia(11L).shares();

        // then
        assertThat(shares)
                .extracting(SavedMediaProjection::sharedMediaId)
                .containsExactly(1L);
    }

    @Test
    void 장소가_나오지_않은_게시물은_보관함_게시물로_읽지_않는다() {
        // given: 회원 12는 분석에 성공했지만 장소가 나오지 않은 게시물 12를 공유 1로 공유했다
        insertKakaoMember(jdbcTemplate, 12L, "saved-media-no-place-owner", null, null, null);
        insertMedia(jdbcTemplate, 12L, "장소 없는 게시물", "empty.jpg", "@empty");
        insertSharedMedia(jdbcTemplate, 1L, 12L, 12L, Instant.parse("2026-11-01T10:00:00Z"));

        // when & then
        assertThat(sharedMediaDao.findSavedMedia(12L).shares()).isEmpty();
    }

    @Test
    void 내_공유가_실패로_남았으면_다른_회원의_공유로_게시물_추출이_성공해도_보관함_게시물로_읽지_않는다() {
        // given: 회원 21의 공유 1은 실패로 끝났고, 나중에 회원 22의 공유 2로 같은 게시물 31의 추출이 성공해 장소가 나왔다
        insertKakaoMember(jdbcTemplate, 21L, "saved-media-failed-owner", null, null, null);
        insertKakaoMember(jdbcTemplate, 22L, "saved-media-success-other", null, null, null);
        insertMedia(jdbcTemplate, 31L, "성수 카페 모음", "31.jpg", "@seongsu");
        insertSavedMediaPlace(1L, "saved-media-failed-place");
        insertMediaPlace(jdbcTemplate, 1L, 31L, 1L);
        ExtractionSnapshot failed = new ExtractionSnapshot(
                ExtractionStatus.FAILED, ExtractionFailureReason.PLACE_NOT_EXTRACTED, 1, MediaSourceType.EXTRACTED);
        insertSharedMedia(jdbcTemplate, 1L, 21L, 31L, Instant.parse("2026-11-01T10:00:00Z"), failed);
        insertSharedMedia(jdbcTemplate, 2L, 22L, 31L, Instant.parse("2026-11-05T10:00:00Z"));

        // when & then
        assertThat(sharedMediaDao.findSavedMedia(21L).shares()).isEmpty();
    }

    @Test
    void 다른_회원의_공유는_보관함_게시물로_읽지_않는다() {
        // given: 회원 30은 게시물 52를 공유 2로 공유했고, 회원 31은 게시물 51을 공유 1로 공유했으며, 두 공유 모두 분석에 성공해 장소가 나왔다
        insertSavedMediaMember(30L);
        insertKakaoMember(jdbcTemplate, 31L, "saved-media-member-other", null, null, null);
        insertMedia(jdbcTemplate, 51L, "게시물 51", "51.jpg", "@author");
        insertMedia(jdbcTemplate, 52L, "게시물 52", "52.jpg", "@author");
        insertMediaPlace(jdbcTemplate, 51L, 51L, 1L);
        insertMediaPlace(jdbcTemplate, 52L, 52L, 1L);
        Instant base = Instant.parse("2026-11-01T03:00:00Z");
        insertSharedMedia(jdbcTemplate, 1L, 31L, 51L, base.plusSeconds(1));
        insertSharedMedia(jdbcTemplate, 2L, 30L, 52L, base);

        // when
        List<SavedMediaProjection> shares = sharedMediaDao.findSavedMedia(30L).shares();

        // then
        assertThat(shares)
                .extracting(SavedMediaProjection::sharedMediaId)
                .containsExactly(2L);
    }

    @Test
    void 추출된_장소가_여럿인_게시물도_한_건으로_읽고_공유와_게시물_정보를_빠짐없이_읽는다() {
        // given: 공유 1의 게시물 14에서 장소 둘이 나왔다
        insertKakaoMember(jdbcTemplate, 13L, "saved-media-columns", null, null, null);
        insertMedia(jdbcTemplate, 14L, "성수 카페 모음", "saved.jpg", "@saved");
        insertSavedMediaPlace(1L, "saved-media-columns-1");
        insertSavedMediaPlace(2L, "saved-media-columns-2");
        insertMediaPlace(jdbcTemplate, 2001L, 14L, 1L);
        insertMediaPlace(jdbcTemplate, 2002L, 14L, 2L);
        insertSharedMedia(jdbcTemplate, 1L, 13L, 14L, Instant.parse("2026-11-01T10:00:00.123456Z"));

        // when
        List<SavedMediaProjection> shares = sharedMediaDao.findSavedMedia(13L).shares();

        // then
        assertThat(shares).containsExactly(new SavedMediaProjection(
                1L,
                14L,
                Instant.parse("2026-11-01T10:00:00.123456Z"),
                "saved.jpg",
                "성수 카페 모음",
                "@saved",
                "https://www.instagram.com/reel/fixture-1/"
        ));
    }

    @Test
    void 보관함_게시물은_게시물마다_최신_공유_한_건만_최신순으로_읽는다() {
        // given: 게시물 21은 공유 1, 2, 3으로 세 번 공유했고, 게시물 22는 같은 시각의 공유 4, 5로 공유했다
        insertSavedMediaMember(15L);
        insertMedia(jdbcTemplate, 21L, "성수 카페 모음", "21.jpg", "@seongsu");
        insertMedia(jdbcTemplate, 22L, "연남 와인바", "22.jpg", "@yeonnam");
        insertMediaPlace(jdbcTemplate, 21L, 21L, 1L);
        insertMediaPlace(jdbcTemplate, 22L, 22L, 1L);
        Instant base = Instant.parse("2026-11-01T03:00:00.123456Z");
        insertSharedMedia(jdbcTemplate, 1L, 15L, 21L, base);
        insertSharedMedia(jdbcTemplate, 2L, 15L, 21L, base.plusSeconds(1));
        insertSharedMedia(jdbcTemplate, 3L, 15L, 21L, base.plusSeconds(2));
        insertSharedMedia(jdbcTemplate, 4L, 15L, 22L, base.plusSeconds(3));
        insertSharedMedia(jdbcTemplate, 5L, 15L, 22L, base.plusSeconds(3));

        // when
        List<SavedMediaProjection> shares = sharedMediaDao.findSavedMedia(15L).shares();

        // then: 게시물 21은 가장 최근 공유 3만 남고, 시각이 같은 공유 4와 5 가운데 ID가 큰 5가 남는다
        assertThat(shares)
                .extracting(SavedMediaProjection::sharedMediaId)
                .containsExactly(5L, 3L);
    }

    @Test
    void 보관함_게시물은_ID보다_공유_시각을_먼저_보고_최신_공유를_고르고_정렬한다() {
        // given: 게시물 21은 공유 10(10-05)과 공유 7(10-07)로 두 번 공유했고, 게시물 22는 공유 9(10-06)로 공유했다
        insertSavedMediaMember(25L);
        insertMedia(jdbcTemplate, 21L, "성수 카페 모음", "21.jpg", "@seongsu");
        insertMedia(jdbcTemplate, 22L, "연남 와인바", "22.jpg", "@yeonnam");
        insertMediaPlace(jdbcTemplate, 21L, 21L, 1L);
        insertMediaPlace(jdbcTemplate, 22L, 22L, 1L);
        insertSharedMedia(jdbcTemplate, 10L, 25L, 21L, Instant.parse("2026-10-05T10:00:00Z"));
        insertSharedMedia(jdbcTemplate, 7L, 25L, 21L, Instant.parse("2026-10-07T10:00:00Z"));
        insertSharedMedia(jdbcTemplate, 9L, 25L, 22L, Instant.parse("2026-10-06T10:00:00Z"));

        // when
        List<SavedMediaProjection> shares = sharedMediaDao.findSavedMedia(25L).shares();

        // then: 게시물 21은 ID가 작아도 공유 시각이 늦은 공유 7이 남고, 공유 9보다 앞에 온다
        assertThat(shares)
                .extracting(SavedMediaProjection::sharedMediaId)
                .containsExactly(7L, 9L);
    }

    @Test
    void 보관함_게시물은_공유_시각이_같으면_공유_ID가_큰_게시물부터_읽는다() {
        // given: 회원 34는 게시물 71과 72를 같은 시각에 공유 1과 2로 공유했고, 두 공유 모두 분석에 성공해 장소가 나왔다
        insertSavedMediaMember(34L);
        insertMedia(jdbcTemplate, 71L, "게시물 71", "71.jpg", "@author");
        insertMedia(jdbcTemplate, 72L, "게시물 72", "72.jpg", "@author");
        insertMediaPlace(jdbcTemplate, 71L, 71L, 1L);
        insertMediaPlace(jdbcTemplate, 72L, 72L, 1L);
        Instant sameTime = Instant.parse("2026-11-01T03:00:00.123456Z");
        insertSharedMedia(jdbcTemplate, 1L, 34L, 71L, sameTime);
        insertSharedMedia(jdbcTemplate, 2L, 34L, 72L, sameTime);

        // when
        List<SavedMediaProjection> shares = sharedMediaDao.findSavedMedia(34L).shares();

        // then
        assertThat(shares)
                .extracting(SavedMediaProjection::sharedMediaId)
                .containsExactly(2L, 1L);
    }

    @Test
    void 보관함_게시물_첫_페이지는_다음_페이지가_있는지_알_수_있게_최신순으로_51건을_읽는다() {
        // given: 게시물 55개를 1초 간격으로 한 번씩 공유했고, 게시물마다 장소가 나왔다
        insertSavedMediaMember(16L);
        insertSavedMediaOneSecondApart(16L, 55);

        // when
        List<SavedMediaProjection> shares = sharedMediaDao.findSavedMedia(16L).shares();

        // then: 최신인 55부터 51건을 읽고, 52번째인 4부터는 읽지 않는다
        assertAll(
                () -> assertThat(shares).hasSize(51),
                () -> assertThat(shares.getFirst().sharedMediaId()).isEqualTo(55L),
                () -> assertThat(shares.getLast().sharedMediaId()).isEqualTo(5L)
        );
    }

    @Test
    void 보관함_게시물_다음_페이지는_커서보다_오래된_게시물만_읽고_다시_공유한_게시물의_옛_공유는_읽지_않는다() {
        // given: 공유 3, 4, 5는 공유 시각이 같고, 게시물 1은 가장 최근에 공유 6으로 다시 공유했다
        insertSavedMediaMember(17L);
        Instant sameTime = Instant.parse("2026-11-01T03:00:00.123456Z");
        for (long mediaId = 1; mediaId <= 5; mediaId++) {
            insertMedia(jdbcTemplate, mediaId, "게시물 " + mediaId, mediaId + ".jpg", "@author");
            insertMediaPlace(jdbcTemplate, mediaId, mediaId, 1L);
        }
        insertSharedMedia(jdbcTemplate, 1L, 17L, 1L, sameTime.minusSeconds(2));
        insertSharedMedia(jdbcTemplate, 2L, 17L, 2L, sameTime.minusNanos(1_000));
        insertSharedMedia(jdbcTemplate, 3L, 17L, 3L, sameTime);
        insertSharedMedia(jdbcTemplate, 4L, 17L, 4L, sameTime);
        insertSharedMedia(jdbcTemplate, 5L, 17L, 5L, sameTime);
        insertSharedMedia(jdbcTemplate, 6L, 17L, 1L, sameTime.plusSeconds(10));

        // when: 공유 4까지 본 뒤 다음 페이지를 읽는다
        List<SavedMediaProjection> shares = sharedMediaDao
                .findSavedMediaBefore(17L, new SharedMediaCursor(sameTime, 4L))
                .shares();

        // then: 시각이 같은 공유 3과 1마이크로초 이른 공유 2는 빠지지 않고, 게시물 1의 옛 공유 1은 공유 6에 가려 다시 나오지 않는다
        assertThat(shares)
                .extracting(SavedMediaProjection::sharedMediaId)
                .containsExactly(3L, 2L);
    }

    @Test
    void 보관함_게시물_다음_페이지도_ID보다_공유_시각을_먼저_보고_커서보다_오래된_게시물을_읽는다() {
        // given: 게시물 22의 공유 7(10-07)까지 읽었고, 게시물 21은 공유 10(10-05)과 공유 2(10-06)로 두 번, 게시물 24는 공유 12(10-03)로 공유했다
        insertSavedMediaMember(26L);
        for (long mediaId = 21; mediaId <= 24; mediaId++) {
            insertMedia(jdbcTemplate, mediaId, "게시물 " + mediaId, mediaId + ".jpg", "@author");
            insertMediaPlace(jdbcTemplate, mediaId, mediaId, 1L);
        }
        Instant cursorCreatedAt = Instant.parse("2026-10-07T10:00:00Z");
        insertSharedMedia(jdbcTemplate, 7L, 26L, 22L, cursorCreatedAt);
        insertSharedMedia(jdbcTemplate, 10L, 26L, 21L, Instant.parse("2026-10-05T10:00:00Z"));
        insertSharedMedia(jdbcTemplate, 2L, 26L, 21L, Instant.parse("2026-10-06T10:00:00Z"));
        insertSharedMedia(jdbcTemplate, 12L, 26L, 24L, Instant.parse("2026-10-03T10:00:00Z"));

        // when: 공유 7까지 본 뒤 다음 페이지를 읽는다
        List<SavedMediaProjection> shares = sharedMediaDao
                .findSavedMediaBefore(26L, new SharedMediaCursor(cursorCreatedAt, 7L))
                .shares();

        // then: 게시물 21은 ID가 큰 공유 10 대신 공유 시각이 늦은 공유 2가 남고, 공유 12는 ID가 커서보다 커도 공유 시각이 이르므로 다음 페이지에 들어와 공유 2 뒤에 온다
        assertThat(shares)
                .extracting(SavedMediaProjection::sharedMediaId)
                .containsExactly(2L, 12L);
    }

    @Test
    void 보관함_게시물_다음_페이지도_공유_시각이_같으면_공유_ID가_큰_게시물부터_읽는다() {
        // given: 회원 35는 게시물 81과 82를 같은 시각에 공유 1과 2로 공유했고, 1초 뒤에 게시물 83을 공유 3으로 공유했으며, 세 공유 모두 분석에 성공해 장소가 나왔다
        insertSavedMediaMember(35L);
        for (long mediaId = 81; mediaId <= 83; mediaId++) {
            insertMedia(jdbcTemplate, mediaId, "게시물 " + mediaId, mediaId + ".jpg", "@author");
            insertMediaPlace(jdbcTemplate, mediaId, mediaId, 1L);
        }
        Instant sameTime = Instant.parse("2026-11-01T03:00:00.123456Z");
        insertSharedMedia(jdbcTemplate, 1L, 35L, 81L, sameTime);
        insertSharedMedia(jdbcTemplate, 2L, 35L, 82L, sameTime);
        insertSharedMedia(jdbcTemplate, 3L, 35L, 83L, sameTime.plusSeconds(1));

        // when: 공유 3까지 본 뒤 다음 페이지를 읽는다
        List<SavedMediaProjection> shares = sharedMediaDao
                .findSavedMediaBefore(35L, new SharedMediaCursor(sameTime.plusSeconds(1), 3L))
                .shares();

        // then
        assertThat(shares)
                .extracting(SavedMediaProjection::sharedMediaId)
                .containsExactly(2L, 1L);
    }

    @Test
    void 보관함_게시물_다음_페이지도_같은_게시물을_같은_시각에_두_번_공유했으면_ID가_큰_공유를_남긴다() {
        // given: 회원 36은 게시물 91을 같은 시각에 공유 1과 2로 두 번 공유했고, 1초 뒤에 게시물 92를 공유 3으로 공유했으며, 세 공유 모두 분석에 성공해 장소가 나왔다
        insertSavedMediaMember(36L);
        insertMedia(jdbcTemplate, 91L, "게시물 91", "91.jpg", "@author");
        insertMedia(jdbcTemplate, 92L, "게시물 92", "92.jpg", "@author");
        insertMediaPlace(jdbcTemplate, 91L, 91L, 1L);
        insertMediaPlace(jdbcTemplate, 92L, 92L, 1L);
        Instant sameTime = Instant.parse("2026-11-01T03:00:00.123456Z");
        insertSharedMedia(jdbcTemplate, 1L, 36L, 91L, sameTime);
        insertSharedMedia(jdbcTemplate, 2L, 36L, 91L, sameTime);
        insertSharedMedia(jdbcTemplate, 3L, 36L, 92L, sameTime.plusSeconds(1));

        // when: 공유 3까지 본 뒤 다음 페이지를 읽는다
        List<SavedMediaProjection> shares = sharedMediaDao
                .findSavedMediaBefore(36L, new SharedMediaCursor(sameTime.plusSeconds(1), 3L))
                .shares();

        // then
        assertThat(shares)
                .extracting(SavedMediaProjection::sharedMediaId)
                .containsExactly(2L);
    }

    @Test
    void 보관함_게시물_다음_페이지에서도_내_공유가_실패로_남은_게시물은_읽지_않는다() {
        // given: 회원 27은 게시물 32, 31, 33을 공유 1, 2, 4로 차례로 공유했고, 게시물 31의 공유 2는 실패로 끝났지만 나중에 회원 28의 공유 3으로 추출이 성공해 장소가 나왔다
        insertSavedMediaMember(27L);
        insertKakaoMember(jdbcTemplate, 28L, "saved-media-next-success-other", null, null, null);
        for (long mediaId = 31; mediaId <= 33; mediaId++) {
            insertMedia(jdbcTemplate, mediaId, "게시물 " + mediaId, mediaId + ".jpg", "@author");
            insertMediaPlace(jdbcTemplate, mediaId, mediaId, 1L);
        }
        Instant base = Instant.parse("2026-11-01T03:00:00Z");
        ExtractionSnapshot failed = new ExtractionSnapshot(
                ExtractionStatus.FAILED, ExtractionFailureReason.PLACE_NOT_EXTRACTED, 1, MediaSourceType.EXTRACTED);
        insertSharedMedia(jdbcTemplate, 1L, 27L, 32L, base);
        insertSharedMedia(jdbcTemplate, 2L, 27L, 31L, base.plusSeconds(1), failed);
        insertSharedMedia(jdbcTemplate, 3L, 28L, 31L, base.plusSeconds(5));
        insertSharedMedia(jdbcTemplate, 4L, 27L, 33L, base.plusSeconds(2));

        // when: 공유 4까지 본 뒤 다음 페이지를 읽는다
        List<SavedMediaProjection> shares = sharedMediaDao
                .findSavedMediaBefore(27L, new SharedMediaCursor(base.plusSeconds(2), 4L))
                .shares();

        // then
        assertThat(shares)
                .extracting(SavedMediaProjection::sharedMediaId)
                .containsExactly(1L);
    }

    @Test
    void 보관함_게시물_다음_페이지에서도_장소가_나오지_않은_게시물은_읽지_않는다() {
        // given: 회원 29는 게시물 41, 42, 43을 공유 1, 2, 3으로 차례로 공유했고, 모두 분석에 성공했지만 게시물 42에서는 장소가 나오지 않았다
        insertSavedMediaMember(29L);
        insertMedia(jdbcTemplate, 41L, "게시물 41", "41.jpg", "@author");
        insertMedia(jdbcTemplate, 42L, "장소 없는 게시물", "42.jpg", "@author");
        insertMedia(jdbcTemplate, 43L, "게시물 43", "43.jpg", "@author");
        insertMediaPlace(jdbcTemplate, 41L, 41L, 1L);
        insertMediaPlace(jdbcTemplate, 43L, 43L, 1L);
        Instant base = Instant.parse("2026-11-01T03:00:00Z");
        insertSharedMedia(jdbcTemplate, 1L, 29L, 41L, base);
        insertSharedMedia(jdbcTemplate, 2L, 29L, 42L, base.plusSeconds(1));
        insertSharedMedia(jdbcTemplate, 3L, 29L, 43L, base.plusSeconds(2));

        // when: 공유 3까지 본 뒤 다음 페이지를 읽는다
        List<SavedMediaProjection> shares = sharedMediaDao
                .findSavedMediaBefore(29L, new SharedMediaCursor(base.plusSeconds(2), 3L))
                .shares();

        // then
        assertThat(shares)
                .extracting(SavedMediaProjection::sharedMediaId)
                .containsExactly(1L);
    }

    @Test
    void 보관함_게시물_다음_페이지에서도_다른_회원의_공유는_읽지_않는다() {
        // given: 회원 32는 게시물 61, 63을 공유 1, 3으로 공유했고, 두 공유 사이 시각에 회원 33이 게시물 62를 공유 2로 공유했으며, 세 공유 모두 분석에 성공해 장소가 나왔다
        insertSavedMediaMember(32L);
        insertKakaoMember(jdbcTemplate, 33L, "saved-media-next-member-other", null, null, null);
        for (long mediaId = 61; mediaId <= 63; mediaId++) {
            insertMedia(jdbcTemplate, mediaId, "게시물 " + mediaId, mediaId + ".jpg", "@author");
            insertMediaPlace(jdbcTemplate, mediaId, mediaId, 1L);
        }
        Instant base = Instant.parse("2026-11-01T03:00:00Z");
        insertSharedMedia(jdbcTemplate, 1L, 32L, 61L, base);
        insertSharedMedia(jdbcTemplate, 2L, 33L, 62L, base.plusSeconds(1));
        insertSharedMedia(jdbcTemplate, 3L, 32L, 63L, base.plusSeconds(2));

        // when: 공유 3까지 본 뒤 다음 페이지를 읽는다
        List<SavedMediaProjection> shares = sharedMediaDao
                .findSavedMediaBefore(32L, new SharedMediaCursor(base.plusSeconds(2), 3L))
                .shares();

        // then
        assertThat(shares)
                .extracting(SavedMediaProjection::sharedMediaId)
                .containsExactly(1L);
    }

    @Test
    void 게시물_탭_목록에서_지운_공유는_빠진다() {
        // given: 게시물 21과 22를 공유 1과 2로 공유해 둘 다 분석에 성공하고 장소가 나왔으며, 게시물 21의 공유 1은 지웠지만 보관함 연결이 남아 있다
        insertSavedMediaOwner(18L, 304L);
        insertMedia(jdbcTemplate, 21L, "성수 카페 모음", "21.jpg", "@seongsu");
        insertMedia(jdbcTemplate, 22L, "연남 와인바", "22.jpg", "@yeonnam");
        insertMediaPlace(jdbcTemplate, 1L, 21L, 1L);
        insertMediaPlace(jdbcTemplate, 2L, 22L, 1L);
        Instant base = Instant.parse("2026-11-01T03:00:00Z");
        insertDeletedSharedMedia(jdbcTemplate, 1L, 18L, 21L, base.plusSeconds(1), base.plusSeconds(10));
        insertSavedPlaceShare(jdbcTemplate, 1L, 304L, 1L, base.plusSeconds(1));
        insertSharedMedia(jdbcTemplate, 2L, 18L, 22L, base);

        // when
        List<SavedMediaProjection> shares = sharedMediaDao.findSavedMedia(18L).shares();

        // then: 장소가 나왔고 보관함 연결도 남은 공유 1은 지웠으므로 빠지고, 공유 2만 남는다
        assertThat(shares)
                .extracting(SavedMediaProjection::sharedMediaId)
                .containsExactly(2L);
    }

    @Test
    void 게시물_탭_다음_페이지에서도_지운_공유는_빠진다() {
        // given: 게시물 21, 22, 23을 차례로 공유해 모두 분석에 성공하고 장소가 나왔으며, 가운데 게시물 22의 공유 2는 지웠지만 보관함 연결이 남아 있다
        insertSavedMediaOwner(19L, 305L);
        Instant base = Instant.parse("2026-11-01T03:00:00Z");
        for (long mediaId = 21; mediaId <= 23; mediaId++) {
            insertMedia(jdbcTemplate, mediaId, "게시물 " + mediaId, mediaId + ".jpg", "@author");
            insertMediaPlace(jdbcTemplate, mediaId, mediaId, 1L);
        }
        insertSharedMedia(jdbcTemplate, 1L, 19L, 21L, base);
        insertDeletedSharedMedia(jdbcTemplate, 2L, 19L, 22L, base.plusSeconds(1), base.plusSeconds(10));
        insertSavedPlaceShare(jdbcTemplate, 2L, 305L, 2L, base.plusSeconds(1));
        insertSharedMedia(jdbcTemplate, 3L, 19L, 23L, base.plusSeconds(2));

        // when: 공유 3까지 본 뒤 다음 페이지를 읽는다
        List<SavedMediaProjection> shares = sharedMediaDao
                .findSavedMediaBefore(19L, new SharedMediaCursor(base.plusSeconds(2), 3L))
                .shares();

        // then: 보관함 연결이 남은 지운 공유 2는 빠지고, 분석에 성공해 장소가 나온 공유 1만 남는다
        assertThat(shares)
                .extracting(SavedMediaProjection::sharedMediaId)
                .containsExactly(1L);
    }

    @Test
    void 고른_공유의_게시물_ID를_읽을_때_남의_공유와_지운_공유는_빼고_한_번씩만_읽는다() {
        // given: 회원 1의 공유 1, 2는 같은 게시물 11이고 공유 3은 이미 지웠으며, 공유 4는 회원 2의 것이다
        insertKakaoMember(jdbcTemplate, 1L, "delete-target-owner", null, null, null);
        insertKakaoMember(jdbcTemplate, 2L, "delete-target-other", null, null, null);
        insertMedia(jdbcTemplate, 11L, null, null, null);
        insertMedia(jdbcTemplate, 12L, null, null, null);
        insertMedia(jdbcTemplate, 13L, null, null, null);
        Instant now = Instant.parse("2026-11-05T10:00:00Z");
        insertSharedMedia(jdbcTemplate, 1L, 1L, 11L, now);
        insertSharedMedia(jdbcTemplate, 2L, 1L, 11L, now);
        insertDeletedSharedMedia(jdbcTemplate, 3L, 1L, 12L, now, now);
        insertSharedMedia(jdbcTemplate, 4L, 2L, 13L, now);

        // when: 없는 공유 999도 함께 보낸다
        List<Long> mediaIds = sharedMediaDao.findMediaIdsByMemberAndIds(1L, List.of(1L, 2L, 3L, 4L, 999L));

        // then
        assertThat(mediaIds).containsExactly(11L);
    }

    @Test
    void 고른_게시물의_내_공유를_모두_지우고_이미_지운_공유와_남의_공유는_건드리지_않는다() {
        // given: 회원 1은 게시물 11을 공유 1, 2로 두 번 공유했고 같은 게시물의 공유 3은 먼저 지웠다. 공유 4는 회원 2의 것이고 공유 5는 회원 1의 다른 게시물이다
        insertKakaoMember(jdbcTemplate, 1L, "soft-delete-owner", null, null, null);
        insertKakaoMember(jdbcTemplate, 2L, "soft-delete-other", null, null, null);
        insertMedia(jdbcTemplate, 11L, null, null, null);
        insertMedia(jdbcTemplate, 12L, null, null, null);
        Instant now = Instant.parse("2026-11-01T10:00:00Z");
        Instant firstDeletedAt = Instant.parse("2026-11-04T10:00:00.123456Z");
        Instant deletedAt = Instant.parse("2026-11-05T10:00:00.654321Z");
        insertSharedMedia(jdbcTemplate, 1L, 1L, 11L, now);
        insertSharedMedia(jdbcTemplate, 2L, 1L, 11L, now.plusSeconds(1));
        insertDeletedSharedMedia(jdbcTemplate, 3L, 1L, 11L, now.minusSeconds(1), firstDeletedAt);
        insertSharedMedia(jdbcTemplate, 4L, 2L, 11L, now);
        insertSharedMedia(jdbcTemplate, 5L, 1L, 12L, now);

        // when
        sharedMediaDao.softDeleteByMemberAndMediaIds(1L, List.of(11L), deletedAt);

        // then
        assertAll(
                () -> assertThat(readDeletedAt(1L).toInstant()).isEqualTo(deletedAt),
                () -> assertThat(readDeletedAt(2L).toInstant()).isEqualTo(deletedAt),
                () -> assertThat(readDeletedAt(3L).toInstant()).isEqualTo(firstDeletedAt),
                () -> assertThat(readDeletedAt(4L)).isNull(),
                () -> assertThat(readDeletedAt(5L)).isNull()
        );
    }

    @Test
    void 추출이_끝나면_장소를_붙일_공유에서_지운_공유는_빠진다() {
        // given: 회원 1은 분석 중인 게시물 1의 공유 1을 지웠고, 회원 2의 공유 2는 남아 있다
        insertKakaoMember(jdbcTemplate, 1L, "latest-deleted-owner", null, null, null);
        insertKakaoMember(jdbcTemplate, 2L, "latest-deleted-other", null, null, null);
        insertExtractingMedia(jdbcTemplate, 1L);
        Instant now = Instant.parse("2026-11-05T10:00:00Z");
        insertDeletedSharedMedia(jdbcTemplate, 1L, 1L, 1L, now, now.plusSeconds(1));
        insertSharedMedia(jdbcTemplate, 2L, 2L, 1L, now);

        // when
        List<SharedMediaOwnerProjection> shares = sharedMediaDao.findLatestSharesByMediaId(1L);

        // then
        assertThat(shares).containsExactly(new SharedMediaOwnerProjection(2L, 2L));
    }

    private Timestamp readDeletedAt(Long sharedMediaId) {
        return jdbcTemplate.queryForObject(
                "SELECT deleted_at FROM shared_media WHERE id = ?", Timestamp.class, sharedMediaId);
    }

    private void insertSavedMediaPlace(Long placeId, String kakaoPlaceId) {
        insertPlaceWithRequiredColumnsOnly(jdbcTemplate, placeId, kakaoPlaceId, "성수 카페",
                "서울 성동구 성수동2가 1-1", new BigDecimal("37.5446"), new BigDecimal("127.0559"));
    }

    /**
     * 보관함 게시물 테스트의 회원과, 게시물마다 추출된 장소로 쓸 장소 하나를 넣는다.
     */
    private void insertSavedMediaMember(Long memberId) {
        insertKakaoMember(jdbcTemplate, memberId, "saved-media-owner-" + memberId, null, null, null);
        insertSavedMediaPlace(1L, "saved-media-owner-place-" + memberId);
    }

    /**
     * 보관함 게시물 테스트의 회원과 장소를 넣고, 공유를 연결할 보관함 항목을 하나 만든다.
     */
    private void insertSavedMediaOwner(Long memberId, Long savedPlaceId) {
        insertSavedMediaMember(memberId);
        insertSavedPlace(jdbcTemplate, savedPlaceId, memberId, 1L, Instant.parse("2026-11-01T00:00:00Z"));
    }

    /**
     * 게시물 1부터 count까지 1초 간격으로 한 번씩 공유하고, 게시물마다 장소 1이 나온 것으로 넣는다. ID가 클수록 최근 공유다.
     */
    private void insertSavedMediaOneSecondApart(Long memberId, int count) {
        Instant base = Instant.parse("2026-11-01T03:00:00Z");
        for (long id = 1; id <= count; id++) {
            insertMedia(jdbcTemplate, id, "게시물 " + id, id + ".jpg", "@author");
            insertMediaPlace(jdbcTemplate, id, id, 1L);
            insertSharedMedia(jdbcTemplate, id, memberId, id, base.plusSeconds(id));
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
