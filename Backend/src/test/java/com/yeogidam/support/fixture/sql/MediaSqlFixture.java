package com.yeogidam.support.fixture.sql;

import org.springframework.jdbc.core.JdbcTemplate;

public final class MediaSqlFixture {

    private MediaSqlFixture() {
    }

    public static void insertExtractingMedia(JdbcTemplate jdbcTemplate, Long mediaId) {
        jdbcTemplate.update("""
                INSERT INTO media (id, media_shortcode, extraction_status, extraction_version, source_type)
                VALUES (?, ?, 'EXTRACTING', 1, 'EXTRACTED')
                """, mediaId, "fixture-media-" + mediaId);
    }

    public static void insertMedia(
            JdbcTemplate jdbcTemplate,
            Long mediaId,
            String caption,
            String thumbnailKey,
            String author
    ) {
        jdbcTemplate.update("""
                INSERT INTO media (
                    id, media_shortcode, caption, thumbnail_key, author,
                    extraction_status, extraction_version, source_type
                )
                VALUES (?, ?, ?, ?, ?, 'SUCCEEDED', 1, 'SEEDED')
                """, mediaId, "fixture-media-" + mediaId, caption, thumbnailKey, author);
    }
}
