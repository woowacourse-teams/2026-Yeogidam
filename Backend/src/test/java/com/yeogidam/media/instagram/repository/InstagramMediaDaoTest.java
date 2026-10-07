package com.yeogidam.media.instagram.repository;

import static com.yeogidam.support.fixture.sql.MediaSqlFixture.insertMedia;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertAll;

import com.yeogidam.media.extraction.domain.ExtractionFailureReason;
import com.yeogidam.media.extraction.domain.InProgressExtraction;
import com.yeogidam.media.instagram.domain.InstagramMedia;
import com.yeogidam.media.instagram.domain.MediaMetadata;
import com.yeogidam.media.instagram.domain.MediaShortcode;
import com.yeogidam.support.JdbcTestSupport;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;

@Import(InstagramMediaDao.class)
class InstagramMediaDaoTest extends JdbcTestSupport {

    private static final int PIPELINE_VERSION = 3;

    @Autowired
    private InstagramMediaDao instagramMediaDao;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void 인스타그램_미디어를_저장하고_생성된_ID를_반환한다() {
        // given
        MediaMetadata metadata = new MediaMetadata("성수 카페 투어", "media.jpg", "@author");
        InstagramMedia media = new InstagramMedia(null, new MediaShortcode("new-media"),
                metadata, new InProgressExtraction());

        // when
        Long mediaId = instagramMediaDao.save(media, PIPELINE_VERSION);

        // then
        assertAll(
                () -> assertThat(mediaId).isPositive(),
                () -> assertThat(jdbcTemplate.queryForObject(
                        "SELECT media_shortcode FROM media WHERE id = ?", String.class, mediaId))
                        .isEqualTo("new-media"),
                () -> assertThat(readMetadata(mediaId)).isEqualTo(metadata),
                () -> assertThat(readExtractionState(mediaId))
                        .isEqualTo(new ExtractionState("EXTRACTING", null, PIPELINE_VERSION, "EXTRACTED"))
        );
    }

    @Test
    void 이미_저장된_shortcode로_새_미디어를_저장하면_중복_예외가_발생한다() {
        // given
        insertMedia(jdbcTemplate, 1L, "기존 게시글", "existing.jpg", "@existing");
        InstagramMedia media = new InstagramMedia(new MediaShortcode("fixture-media-1"));

        // when & then
        assertThatThrownBy(() -> instagramMediaDao.save(media, PIPELINE_VERSION))
                .isInstanceOf(DuplicateKeyException.class);
        assertAll(
                () -> assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM media", Integer.class))
                        .isEqualTo(1),
                () -> assertThat(readMetadata(1L))
                        .isEqualTo(new MediaMetadata("기존 게시글", "existing.jpg", "@existing"))
        );
    }

    @Test
    void 인스타그램_미디어의_메타데이터를_업데이트한다() {
        // given
        insertMedia(jdbcTemplate, 1L, "기존 게시글", "before.jpg", "@before");
        insertMedia(jdbcTemplate, 2L, "다른 게시글", "other.jpg", "@other");
        MediaMetadata metadata = new MediaMetadata("수정된 게시글", "after.jpg", "@after");

        // when
        instagramMediaDao.updateMetadata(1L, metadata);

        // then
        assertAll(
                () -> assertThat(readMetadata(1L)).isEqualTo(metadata),
                () -> assertThat(readMetadata(2L))
                        .isEqualTo(new MediaMetadata("다른 게시글", "other.jpg", "@other")),
                () -> assertThat(readExtractionState(1L))
                        .isEqualTo(new ExtractionState("SUCCEEDED", null, 1, "SEEDED"))
        );
    }

    @ParameterizedTest
    @CsvSource({
            "EXTRACTING,,FAILED,CONTENT_UNAVAILABLE",
            "SUCCEEDED,,SUCCEEDED,",
            "FAILED,UNEXPECTED,FAILED,UNEXPECTED"
    })
    void 진행_중인_미디어에_추출_실패_상태를_반영한다(
            String status,
            String failureReason,
            String expectedStatus,
            String expectedFailureReason
    ) {
        // given
        insertMedia(jdbcTemplate, 1L, status, failureReason, 2, "EXTRACTED");
        insertMedia(jdbcTemplate, 2L, "EXTRACTING", null, 2, "EXTRACTED");

        // when
        instagramMediaDao.failExtractionIfInProgress(1L, ExtractionFailureReason.CONTENT_UNAVAILABLE);

        // then
        assertAll(
                () -> assertThat(readExtractionState(1L))
                        .isEqualTo(new ExtractionState(expectedStatus, expectedFailureReason, 2, "EXTRACTED")),
                () -> assertThat(readExtractionState(2L))
                        .isEqualTo(new ExtractionState("EXTRACTING", null, 2, "EXTRACTED"))
        );
    }

    @ParameterizedTest
    @CsvSource({"EXTRACTING,,true", "SUCCEEDED,,false", "FAILED,UNEXPECTED,false"})
    void 대상_미디어의_추출_진행_여부를_조회한다(
            String extractionStatus,
            String failureReason,
            boolean expected
    ) {
        // given
        insertMedia(jdbcTemplate, 1L, extractionStatus, failureReason, 2, "EXTRACTED");
        insertMedia(jdbcTemplate, 2L, "EXTRACTING", null, 2, "EXTRACTED");

        // when
        boolean inProgress = instagramMediaDao.isExtractionInProgressForUpdate(1L);

        // then
        assertThat(inProgress).isEqualTo(expected);
    }

    @ParameterizedTest
    @CsvSource({"EXTRACTING,,true,SUCCEEDED", "SUCCEEDED,,false,SUCCEEDED", "FAILED,UNEXPECTED,false,FAILED"})
    void 진행_중인_미디어에만_추출_성공_상태를_반영한다(
            String status,
            String failureReason,
            boolean expected,
            String expectedStatus
    ) {
        // given
        insertMedia(jdbcTemplate, 1L, status, failureReason, 2, "EXTRACTED");
        insertMedia(jdbcTemplate, 2L, "EXTRACTING", null, 2, "EXTRACTED");

        // when
        boolean succeeded = instagramMediaDao.succeedExtractionIfInProgress(1L);
        boolean succeededAgain = instagramMediaDao.succeedExtractionIfInProgress(1L);

        // then
        assertAll(
                () -> assertThat(succeeded).isEqualTo(expected),
                () -> assertThat(succeededAgain).isFalse(),
                () -> assertThat(readExtractionState(1L))
                        .isEqualTo(new ExtractionState(expectedStatus, failureReason, 2, "EXTRACTED")),
                () -> assertThat(readExtractionState(2L))
                        .isEqualTo(new ExtractionState("EXTRACTING", null, 2, "EXTRACTED"))
        );
    }

    @ParameterizedTest
    @CsvSource({"SUCCEEDED,,true", "EXTRACTING,,false", "FAILED,UNEXPECTED,false"})
    void 추출에_성공한_미디어만_완료로_판단한다(
            String extractionStatus,
            String failureReason,
            boolean expected
    ) {
        // given
        insertMedia(jdbcTemplate, 1L, extractionStatus, failureReason, 1, "SEEDED");

        // when
        boolean succeeded = instagramMediaDao.isExtractionSucceeded(1L);

        // then
        assertThat(succeeded).isEqualTo(expected);
    }


    @ParameterizedTest
    @CsvSource({
            "FAILED,CONTENT_UNAVAILABLE,2,EXTRACTED,true,EXTRACTING,,3",
            "FAILED,PROCESSING_FAILED,3,EXTRACTED,true,EXTRACTING,,3",
            "FAILED,UNEXPECTED,3,EXTRACTED,true,EXTRACTING,,3",
            "FAILED,CONTENT_UNAVAILABLE,3,EXTRACTED,false,FAILED,CONTENT_UNAVAILABLE,3",
            "FAILED,PLACE_NOT_EXTRACTED,3,EXTRACTED,false,FAILED,PLACE_NOT_EXTRACTED,3",
            "FAILED,PLACE_NOT_MATCHED,3,EXTRACTED,false,FAILED,PLACE_NOT_MATCHED,3",
            "FAILED,UNEXPECTED,4,EXTRACTED,false,FAILED,UNEXPECTED,4",
            "EXTRACTING,,2,EXTRACTED,false,EXTRACTING,,2",
            "SUCCEEDED,,2,EXTRACTED,false,SUCCEEDED,,2",
            "FAILED,UNEXPECTED,2,SEEDED,false,FAILED,UNEXPECTED,2",
            "FAILED,PROCESSING_FAILED,3,SEEDED,false,FAILED,PROCESSING_FAILED,3"
    })
    void 재시도는_실패_상태와_버전과_실패_이유와_출처에_따라_허용한다(
            String status,
            String failureReason,
            int version,
            String sourceType,
            boolean expected,
            String expectedStatus,
            String expectedFailureReason,
            int expectedVersion
    ) {
        // given
        insertMedia(jdbcTemplate, 1L, status, failureReason, version, sourceType);
        insertMedia(jdbcTemplate, 2L, "FAILED", "UNEXPECTED", 2, "EXTRACTED");

        // when
        boolean retried = instagramMediaDao.retryFailedExtractionIfEligible(1L, PIPELINE_VERSION);
        boolean retriedAgain = instagramMediaDao.retryFailedExtractionIfEligible(1L, PIPELINE_VERSION);

        // then
        assertAll(
                () -> assertThat(retried).isEqualTo(expected),
                () -> assertThat(retriedAgain).isFalse(),
                () -> assertThat(readExtractionState(1L))
                        .isEqualTo(new ExtractionState(
                                expectedStatus, expectedFailureReason, expectedVersion, sourceType)),
                () -> assertThat(readExtractionState(2L))
                        .isEqualTo(new ExtractionState("FAILED", "UNEXPECTED", 2, "EXTRACTED"))
        );
    }

    @Test
    void shortcode로_일치하는_미디어_ID를_조회하고_없으면_빈_값을_반환한다() {
        // given
        insertMedia(jdbcTemplate, 1L, null, null, null);
        insertMedia(jdbcTemplate, 2L, null, null, null);

        // when & then
        assertAll(
                () -> assertThat(instagramMediaDao.findIdByShortcode(new MediaShortcode("fixture-media-1")))
                        .contains(1L),
                () -> assertThat(instagramMediaDao.findIdByShortcodeForUpdate(new MediaShortcode("fixture-media-2")))
                        .contains(2L),
                () -> assertThat(instagramMediaDao.findIdByShortcode(new MediaShortcode("missing-media"))).isEmpty(),
                () -> assertThat(instagramMediaDao.findIdByShortcodeForUpdate(new MediaShortcode("missing-media")))
                        .isEmpty()
        );
    }

    private MediaMetadata readMetadata(Long mediaId) {
        return jdbcTemplate.queryForObject("""
                SELECT caption, thumbnail_key, author
                FROM media
                WHERE id = ?
                """, (resultSet, rowNumber) -> new MediaMetadata(
                resultSet.getString("caption"),
                resultSet.getString("thumbnail_key"),
                resultSet.getString("author")), mediaId);
    }

    private ExtractionState readExtractionState(Long mediaId) {
        return jdbcTemplate.queryForObject("""
                SELECT extraction_status, failure_reason, extraction_version, source_type
                FROM media
                WHERE id = ?
                """, (resultSet, rowNumber) -> new ExtractionState(
                resultSet.getString("extraction_status"),
                resultSet.getString("failure_reason"),
                resultSet.getInt("extraction_version"),
                resultSet.getString("source_type")), mediaId);
    }

    private record ExtractionState(String status, String failureReason, int version, String sourceType) {
    }
}
