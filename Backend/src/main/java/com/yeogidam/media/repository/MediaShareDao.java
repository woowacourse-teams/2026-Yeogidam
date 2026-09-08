package com.yeogidam.media.repository;

import java.util.List;
import java.util.Objects;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

@Repository
public class MediaShareDao {

    private static final String VIEW_SELECT = """
            SELECT s.id AS share_id, s.user_id, s.media_id, s.shared_url, s.created_at AS shared_at,
                   m.title, m.caption, m.thumbnail_url, m.author_username,
                   m.extraction_status, m.failure_reason, m.processing_version
            FROM media_share AS s
            INNER JOIN instagram_media AS m
              ON m.id = s.media_id
            """;

    private static final RowMapper<MediaShareView> VIEW_ROW_MAPPER = (resultSet, rowNumber) ->
            new MediaShareView(
                    resultSet.getLong("share_id"),
                    resultSet.getLong("user_id"),
                    resultSet.getLong("media_id"),
                    resultSet.getString("shared_url"),
                    resultSet.getTimestamp("shared_at").toLocalDateTime(),
                    resultSet.getString("title"),
                    resultSet.getString("caption"),
                    resultSet.getString("thumbnail_url"),
                    resultSet.getString("author_username"),
                    resultSet.getString("extraction_status"),
                    resultSet.getString("failure_reason"),
                    resultSet.getInt("processing_version"));

    private final JdbcTemplate jdbcTemplate;

    public MediaShareDao(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public Long insert(
            Long userId,
            Long mediaId,
            String sharedUrl
    ) {
        String sql = "INSERT INTO media_share (user_id, media_id, shared_url) VALUES (?, ?, ?)";
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(connection -> {
            var statement = connection.prepareStatement(sql, new String[]{"id"});
            statement.setLong(1, userId);
            statement.setLong(2, mediaId);
            statement.setString(3, sharedUrl);
            return statement;
        }, keyHolder);
        return Objects.requireNonNull(keyHolder.getKey()).longValue();
    }

    public Optional<MediaShareView> findViewById(Long shareId) {
        String sql = VIEW_SELECT + "WHERE s.id = ?";
        return jdbcTemplate.query(sql, VIEW_ROW_MAPPER, shareId).stream()
                .findFirst();
    }

    public List<MediaShareView> findAllByUserId(Long userId) {
        String sql = VIEW_SELECT + "WHERE s.user_id = ? ORDER BY s.created_at DESC, s.id DESC";
        return jdbcTemplate.query(sql, VIEW_ROW_MAPPER, userId);
    }

    public List<MediaShareView> findAllSavedByPlaceForUser(
            Long userId,
            Long placeId
    ) {
        String sql = VIEW_SELECT + """
                INNER JOIN share_place AS sp
                  ON sp.share_id = s.id
                WHERE sp.place_id = ? AND sp.decision_status = 'SAVED' AND s.user_id = ?
                ORDER BY s.created_at DESC, s.id DESC
                """;
        return jdbcTemplate.query(sql, VIEW_ROW_MAPPER, placeId, userId);
    }

    /**
     * 추출 성공 시 후보를 발급받을 공유 건들. 후보가 이미 있는 공유는 제외한다.
     */
    public List<Long> findIdsWithoutCandidatesByMediaId(Long mediaId) {
        String sql = """
                SELECT s.id FROM media_share AS s
                WHERE s.media_id = ?
                  AND NOT EXISTS (SELECT 1 FROM share_place AS sp WHERE sp.share_id = s.id)
                """;
        return jdbcTemplate.queryForList(sql, Long.class, mediaId);
    }
}
