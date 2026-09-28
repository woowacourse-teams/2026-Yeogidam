package com.yeogidam.media.instagram.repository;

import com.yeogidam.media.instagram.domain.InstagramMedia;
import com.yeogidam.media.instagram.domain.MediaShortcode;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.simple.SimpleJdbcInsert;
import org.springframework.stereotype.Repository;

@Repository
public class InstagramMediaDao {

    private static final RowMapper<Long> ID_ROW_MAPPER = (resultSet, rowNumber)
            -> resultSet.getLong("id");

    private final JdbcTemplate jdbcTemplate;
    private final SimpleJdbcInsert jdbcInsert;

    public InstagramMediaDao(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
        this.jdbcInsert = new SimpleJdbcInsert(jdbcTemplate)
                .withTableName("media")
                .usingColumns("media_shortcode", "caption", "thumbnail_url", "author",
                        "extraction_status", "extraction_version", "source_type")
                .usingGeneratedKeyColumns("id");
    }

    public Long save(InstagramMedia instagramMedia, int pipelineVersion) {
        return jdbcInsert.executeAndReturnKey(insertParameters(instagramMedia, pipelineVersion)).longValue();
    }

    private MapSqlParameterSource insertParameters(InstagramMedia instagramMedia, int pipelineVersion) {
        return new MapSqlParameterSource()
                .addValue("media_shortcode", instagramMedia.getShortcode())
                .addValue("caption", instagramMedia.metadata().caption())
                .addValue("thumbnail_url", instagramMedia.metadata().thumbnailUrl())
                .addValue("author", instagramMedia.metadata().author())
                .addValue("extraction_status", instagramMedia.extraction().status().name())
                .addValue("extraction_version", pipelineVersion)
                .addValue("source_type", "EXTRACTED");
    }

    public Optional<Long> findIdByShortcode(MediaShortcode shortcode) {
        String sql = """
                SELECT id
                FROM media
                WHERE media_shortcode = ?
                """;
        return findIdByShortcode(sql, shortcode);
    }

    public Optional<Long> findIdByShortcodeForUpdate(MediaShortcode shortcode) {
        String sql = """
                SELECT id
                FROM media
                WHERE media_shortcode = ?
                FOR UPDATE
                """;
        return findIdByShortcode(sql, shortcode);
    }

    private Optional<Long> findIdByShortcode(String sql, MediaShortcode shortcode) {
        return jdbcTemplate.query(sql, ID_ROW_MAPPER, shortcode.value())
                .stream()
                .findFirst();
    }
}
