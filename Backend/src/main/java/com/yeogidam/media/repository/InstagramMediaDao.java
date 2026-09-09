package com.yeogidam.media.repository;

import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.Objects;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

@Repository
public class InstagramMediaDao {

    private static final RowMapper<InstagramMediaRecord> MEDIA_ROW_MAPPER = (resultSet, rowNumber) ->
            new InstagramMediaRecord(
                    resultSet.getLong("id"),
                    resultSet.getString("media_shortcode"),
                    resultSet.getString("caption"),
                    resultSet.getString("thumbnail_url"),
                    resultSet.getString("author"),
                    resultSet.getString("extraction_status"),
                    resultSet.getString("failure_reason"),
                    resultSet.getInt("processing_version"),
                    resultSet.getTimestamp("created_at").toLocalDateTime());

    private final JdbcTemplate jdbcTemplate;

    public InstagramMediaDao(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public Long insert(InstagramMediaRecord mediaRecord) {
        String sql = """
                INSERT INTO instagram_media
                    (media_shortcode, caption, thumbnail_url, author,
                     extraction_status, processing_version)
                VALUES (?, ?, ?, ?, ?, ?)
                """;
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(
                connection -> prepareInsert(connection.prepareStatement(sql, new String[]{"id"}), mediaRecord),
                keyHolder);
        return Objects.requireNonNull(keyHolder.getKey()).longValue();
    }

    private PreparedStatement prepareInsert(
            PreparedStatement statement,
            InstagramMediaRecord mediaRecord
    ) throws SQLException {
        statement.setString(1, mediaRecord.mediaShortcode());
        statement.setString(2, mediaRecord.caption());
        statement.setString(3, mediaRecord.thumbnailUrl());
        statement.setString(4, mediaRecord.author());
        statement.setString(5, mediaRecord.extractionStatus());
        statement.setInt(6, mediaRecord.processingVersion());
        return statement;
    }

    public Optional<InstagramMediaRecord> findById(Long id) {
        String sql = "SELECT * FROM instagram_media WHERE id = ?";
        return jdbcTemplate.query(sql, MEDIA_ROW_MAPPER, id).stream()
                .findFirst();
    }

    public Optional<InstagramMediaRecord> findByShortcode(String mediaShortcode) {
        String sql = "SELECT * FROM instagram_media WHERE media_shortcode = ?";
        return jdbcTemplate.query(sql, MEDIA_ROW_MAPPER, mediaShortcode).stream()
                .findFirst();
    }

    public void updateContent(
            Long id,
            String caption,
            String thumbnailUrl,
            String author
    ) {
        String sql = "UPDATE instagram_media SET caption = ?, thumbnail_url = ?, author = ? WHERE id = ?";
        jdbcTemplate.update(sql, caption, thumbnailUrl, author, id);
    }

    public void updateExtractionResult(
            Long id,
            String extractionStatus,
            String failureReason
    ) {
        String sql = "UPDATE instagram_media SET extraction_status = ?, failure_reason = ? WHERE id = ?";
        jdbcTemplate.update(sql, extractionStatus, failureReason, id);
    }

    public int failAllStuckExtracting() {
        String sql = """
                UPDATE instagram_media SET extraction_status = 'FAILED', failure_reason = 'UNEXPECTED'
                WHERE extraction_status = 'EXTRACTING'
                """;
        return jdbcTemplate.update(sql);
    }

    public int updateToExtractingIfFailed(Long id) {
        String sql = """
                UPDATE instagram_media SET extraction_status = 'EXTRACTING', failure_reason = NULL
                WHERE id = ? AND extraction_status = 'FAILED'
                """;
        return jdbcTemplate.update(sql, id);
    }

    /**
     * 실패했거나 처리 버전이 지난 게시물의 재추출을 선점한다.
     * 이미 추출 중이면 손대지 않아, 동시에 여러 공유가 붙어도 파이프라인은 한 번만 돈다.
     */
    public int claimReprocess(
            Long id,
            int currentVersion
    ) {
        String sql = """
                UPDATE instagram_media
                SET extraction_status = 'EXTRACTING', failure_reason = NULL, processing_version = ?
                WHERE id = ? AND extraction_status <> 'EXTRACTING'
                  AND (extraction_status = 'FAILED' OR processing_version <> ?)
                """;
        return jdbcTemplate.update(sql, currentVersion, id, currentVersion);
    }
}
