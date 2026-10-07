package com.yeogidam.media.instagram.repository;

import com.yeogidam.media.extraction.domain.ExtractionFailureReason;
import com.yeogidam.media.extraction.domain.ExtractionSnapshot;
import com.yeogidam.media.extraction.domain.ExtractionStatus;
import com.yeogidam.media.instagram.domain.InstagramMedia;
import com.yeogidam.media.instagram.domain.MediaMetadata;
import com.yeogidam.media.instagram.domain.MediaShortcode;
import java.sql.ResultSet;
import java.sql.SQLException;
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

    private static final RowMapper<ExtractionSnapshot> EXTRACTION_SNAPSHOT_ROW_MAPPER = (resultSet, rowNumber) ->
            new ExtractionSnapshot(
                    ExtractionStatus.valueOf(resultSet.getString("extraction_status")),
                    failureReason(resultSet),
                    resultSet.getInt("extraction_version")
            );

    private static ExtractionFailureReason failureReason(ResultSet resultSet) throws SQLException {
        String reason = resultSet.getString("failure_reason");
        if (reason == null) {
            return null;
        }
        return ExtractionFailureReason.valueOf(reason);
    }

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

    public boolean failExtractionIfInProgress(Long mediaId, ExtractionFailureReason failureReason) {
        String sql = """
                UPDATE media
                SET extraction_status = 'FAILED', failure_reason = ?
                WHERE id = ? AND extraction_status = 'EXTRACTING'
                """;
        return jdbcTemplate.update(sql, failureReason.name(), mediaId) == 1;
    }

    public ExtractionSnapshot findExtractionSnapshotForUpdate(Long mediaId) {
        String sql = """
                SELECT extraction_status, failure_reason, extraction_version
                FROM media
                WHERE id = ?
                FOR UPDATE
                """;
        return jdbcTemplate.queryForObject(sql, EXTRACTION_SNAPSHOT_ROW_MAPPER, mediaId);
    }

    public boolean isExtractionSucceeded(Long mediaId) {
        String sql = """
                SELECT EXISTS (
                    SELECT 1
                    FROM media
                    WHERE id = ?
                      AND extraction_status = 'SUCCEEDED'
                )
                """;
        return jdbcTemplate.queryForObject(sql, Boolean.class, mediaId);
    }

    public boolean succeedExtractionIfInProgress(Long mediaId) {
        String sql = """
                UPDATE media
                SET extraction_status = 'SUCCEEDED', failure_reason = NULL
                WHERE id = ? AND extraction_status = 'EXTRACTING'
                """;
        return jdbcTemplate.update(sql, mediaId) == 1;
    }

    /**
     * 같은 트랜잭션에서 게시물 행을 잠그고 재시도 가능 여부를 확인한 뒤 호출한다.
     */
    public void updateExtractionForRetry(Long mediaId, int pipelineVersion) {
        String sql = """
                UPDATE media
                SET extraction_status = 'EXTRACTING',
                    failure_reason = NULL,
                    extraction_version = ?
                WHERE id = ?
                """;
        jdbcTemplate.update(sql, pipelineVersion, mediaId);
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
}
