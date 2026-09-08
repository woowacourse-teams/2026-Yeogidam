package com.yeogidam.media.repository;

import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.List;
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
                    resultSet.getLong("user_id"),
                    resultSet.getString("shared_url"),
                    resultSet.getString("media_shortcode"),
                    resultSet.getString("title"),
                    resultSet.getString("caption"),
                    resultSet.getString("thumbnail_url"),
                    resultSet.getString("author_username"),
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
                    (user_id, shared_url, media_shortcode, title, caption, thumbnail_url, author_username,
                     extraction_status, processing_version)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        statement.setLong(1, mediaRecord.userId());
        statement.setString(2, mediaRecord.sharedUrl());
        statement.setString(3, mediaRecord.mediaShortcode());
        statement.setString(4, mediaRecord.title());
        statement.setString(5, mediaRecord.caption());
        statement.setString(6, mediaRecord.thumbnailUrl());
        statement.setString(7, mediaRecord.authorUsername());
        statement.setString(8, mediaRecord.extractionStatus());
        statement.setInt(9, mediaRecord.processingVersion());
        return statement;
    }

    public List<InstagramMediaRecord> findAllByUserId(Long userId) {
        String sql = "SELECT * FROM instagram_media WHERE user_id = ? ORDER BY created_at DESC, id DESC";
        return jdbcTemplate.query(sql, MEDIA_ROW_MAPPER, userId);
    }

    public Optional<InstagramMediaRecord> findById(Long id) {
        String sql = "SELECT * FROM instagram_media WHERE id = ?";
        return jdbcTemplate.query(sql, MEDIA_ROW_MAPPER, id).stream()
                .findFirst();
    }

    public Optional<InstagramMediaRecord> findCompletedByShortcode(
            String mediaShortcode,
            int processingVersion
    ) {
        String sql = """
                SELECT * FROM instagram_media
                WHERE media_shortcode = ? AND extraction_status = 'SUCCEEDED' AND processing_version = ?
                ORDER BY id DESC
                """;
        return jdbcTemplate.query(sql, MEDIA_ROW_MAPPER, mediaShortcode, processingVersion).stream()
                .findFirst();
    }

    public List<InstagramMediaRecord> findAllSavedByPlaceForUser(
            Long userId,
            Long placeId
    ) {
        String sql = """
                SELECT m.* FROM instagram_media AS m
                INNER JOIN media_place AS mp
                  ON mp.media_id = m.id
                WHERE mp.place_id = ? AND mp.decision_status = 'SAVED' AND m.user_id = ?
                ORDER BY m.created_at DESC, m.id DESC
                """;
        return jdbcTemplate.query(sql, MEDIA_ROW_MAPPER, placeId, userId);
    }

    public void updateContent(
            Long id,
            String title,
            String caption,
            String thumbnailUrl,
            String authorUsername
    ) {
        String sql = "UPDATE instagram_media SET title = ?, caption = ?, thumbnail_url = ?, author_username = ? WHERE id = ?";
        jdbcTemplate.update(sql, title, caption, thumbnailUrl, authorUsername, id);
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
}
