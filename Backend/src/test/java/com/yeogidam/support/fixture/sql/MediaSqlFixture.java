package com.yeogidam.support.fixture.sql;

import org.springframework.jdbc.core.JdbcTemplate;

public final class MediaSqlFixture {

    private MediaSqlFixture() {
    }

    public static void createMedia(
            JdbcTemplate jdbcTemplate,
            Long mediaId,
            String caption,
            String thumbnailUrl,
            String author
    ) {
        jdbcTemplate.update("""
                INSERT INTO media (
                    id, media_shortcode, caption, thumbnail_url, author,
                    extraction_status, extraction_version, source_type
                )
                VALUES (?, ?, ?, ?, ?, 'SUCCEEDED', 1, 'SEEDED')
                """, mediaId, "fixture-media-" + mediaId, caption, thumbnailUrl, author);
    }
}
