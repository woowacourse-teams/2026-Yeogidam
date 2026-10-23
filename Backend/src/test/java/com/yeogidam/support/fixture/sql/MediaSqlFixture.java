package com.yeogidam.support.fixture.sql;

import com.yeogidam.media.extraction.domain.ExtractionFailureReason;
import com.yeogidam.media.extraction.domain.ExtractionStatus;
import org.springframework.jdbc.core.JdbcTemplate;

public final class MediaSqlFixture {

    private MediaSqlFixture() {
    }

    public static void insertExtractingMedia(JdbcTemplate jdbcTemplate, Long mediaId) {
        insertMedia(jdbcTemplate, mediaId, 1, ExtractionStatus.EXTRACTING);
    }

    public static void insertFailedMedia(
            JdbcTemplate jdbcTemplate,
            Long mediaId,
            int extractionVersion,
            ExtractionFailureReason failureReason
    ) {
        jdbcTemplate.update("""
                INSERT INTO media (
                    id, media_shortcode, extraction_status, failure_reason, extraction_version, source_type
                )
                VALUES (?, ?, 'FAILED', ?, ?, 'EXTRACTED')
                """, mediaId, shortcode(mediaId), failureReason.name(), extractionVersion);
    }

    public static void insertMedia(
            JdbcTemplate jdbcTemplate,
            Long mediaId,
            int extractionVersion,
            ExtractionStatus status
    ) {
        jdbcTemplate.update("""
                INSERT INTO media (id, media_shortcode, extraction_status, extraction_version, source_type)
                VALUES (?, ?, ?, ?, 'EXTRACTED')
                """, mediaId, shortcode(mediaId), status.name(), extractionVersion);
    }

    public static void insertMedia(
            JdbcTemplate jdbcTemplate,
            Long mediaId,
            String caption,
            String thumbnailKey,
            String author
    ) {
        insertMedia(jdbcTemplate, mediaId, caption, thumbnailKey, author, "SUCCEEDED", null, 1, "SEEDED");
    }

    public static void insertMedia(
            JdbcTemplate jdbcTemplate,
            Long mediaId,
            String extractionStatus,
            String failureReason,
            int extractionVersion,
            String sourceType
    ) {
        insertMedia(jdbcTemplate, mediaId, null, null, null,
                extractionStatus, failureReason, extractionVersion, sourceType);
    }

    public static void insertMedia(
            JdbcTemplate jdbcTemplate,
            Long mediaId,
            String caption,
            String thumbnailKey,
            String author,
            String extractionStatus,
            String failureReason,
            int extractionVersion,
            String sourceType
    ) {
        jdbcTemplate.update("""
                INSERT INTO media (
                    id, media_shortcode, caption, thumbnail_key, author,
                    extraction_status, failure_reason, extraction_version, source_type
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, mediaId, shortcode(mediaId), caption, thumbnailKey, author,
                extractionStatus, failureReason, extractionVersion, sourceType);
    }

    public static String sharedUrl(Long mediaId) {
        return "https://www.instagram.com/reel/" + shortcode(mediaId) + "/";
    }

    private static String shortcode(Long mediaId) {
        return "fixture-media-" + mediaId;
    }
}
