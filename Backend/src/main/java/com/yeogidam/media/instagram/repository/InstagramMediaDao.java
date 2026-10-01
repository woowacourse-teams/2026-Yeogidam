package com.yeogidam.media.instagram.repository;

import com.yeogidam.media.extraction.domain.ExtractionFailureReason;
import com.yeogidam.media.instagram.domain.InstagramMedia;
import com.yeogidam.media.instagram.domain.MediaMetadata;
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
                .usingColumns("media_shortcode", "caption", "thumbnail_key", "author",
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
                .addValue("thumbnail_key", instagramMedia.metadata().thumbnailKey())
                .addValue("author", instagramMedia.metadata().author())
                .addValue("extraction_status", instagramMedia.extraction().status().name())
                .addValue("extraction_version", pipelineVersion)
                .addValue("source_type", "EXTRACTED");
    }

    public void updateMetadata(Long mediaId, MediaMetadata metadata) {
        String sql = """
                UPDATE media
                SET caption = ?, thumbnail_key = ?, author = ?
                WHERE id = ?
                """;
        jdbcTemplate.update(sql, metadata.caption(), metadata.thumbnailKey(), metadata.author(), mediaId);
    }

    public void failExtractionIfInProgress(Long mediaId, ExtractionFailureReason failureReason) {
        String sql = """
                UPDATE media
                SET extraction_status = 'FAILED', failure_reason = ?
                WHERE id = ? AND extraction_status = 'EXTRACTING'
                """;
        jdbcTemplate.update(sql, failureReason.name(), mediaId);
    }

    public boolean isExtractionInProgressForUpdate(Long mediaId) {
        String sql = """
                SELECT extraction_status
                FROM media
                WHERE id = ?
                FOR UPDATE
                """;
        String status = jdbcTemplate.queryForObject(sql, String.class, mediaId);
        return "EXTRACTING".equals(status);
    }

    public boolean succeedExtractionIfInProgress(Long mediaId) {
        String sql = """
                UPDATE media
                SET extraction_status = 'SUCCEEDED', failure_reason = NULL
                WHERE id = ? AND extraction_status = 'EXTRACTING'
                """;
        return jdbcTemplate.update(sql, mediaId) == 1;
    }

    public boolean retryFailedExtractionIfEligible(Long mediaId, int pipelineVersion) {
        String sql = """
                UPDATE media
                SET extraction_status = 'EXTRACTING',
                    failure_reason = NULL,
                    extraction_version = ?
                WHERE id = ?
                  AND extraction_status = 'FAILED'
                  AND (
                      extraction_version < ?
                      OR (
                          extraction_version = ?
                          AND failure_reason IN ('PROCESSING_FAILED', 'UNEXPECTED')
                      )
                  )
                  AND source_type = 'EXTRACTED'
                """;
        return jdbcTemplate.update(sql, pipelineVersion, mediaId, pipelineVersion, pipelineVersion) == 1;
    }

    public Optional<Long> findIdByShortcodeForUpdate(MediaShortcode shortcode) {
        String sql = """
                SELECT id
                FROM media
                WHERE media_shortcode = ?
                FOR UPDATE
                """;
        return jdbcTemplate.query(sql, ID_ROW_MAPPER, shortcode.value())
                .stream()
                .findFirst();
    }

    public Optional<Long> findIdByShortcode(MediaShortcode shortcode) {
        String sql = """
                SELECT id
                FROM media
                WHERE media_shortcode = ?
                """;
        return jdbcTemplate.query(sql, ID_ROW_MAPPER, shortcode.value())
                .stream()
                .findFirst();
    }
}
