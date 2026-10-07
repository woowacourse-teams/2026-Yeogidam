package com.yeogidam.support.fixture.sql;

import org.springframework.jdbc.core.JdbcTemplate;

public final class MediaSqlFixture {

    private MediaSqlFixture() {
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
                """, mediaId, "fixture-media-" + mediaId, caption, thumbnailKey, author,
                extractionStatus, failureReason, extractionVersion, sourceType);
    }
}
