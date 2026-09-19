package com.yeogidam.media.share.repository;

import java.util.Optional;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

@Repository
public class ShareDao {

    private static final RowMapper<ShareResultProjection> SHARE_RESULT_ROW_MAPPER = (resultSet, rowNumber) ->
            new ShareResultProjection(
                    resultSet.getLong("shared_media_id"),
                    resultSet.getTimestamp("created_at").toInstant(),
                    resultSet.getString("thumbnail_url"),
                    resultSet.getString("caption"),
                    resultSet.getString("author"),
                    resultSet.getString("extraction_status"),
                    resultSet.getString("failure_reason"),
                    resultSet.getString("shared_url")
            );

    private static final RowMapper<ShareProjection> SHARE_ROW_MAPPER = (resultSet, rowNumber) ->
            new ShareProjection(
                    resultSet.getLong("shared_media_id"),
                    resultSet.getTimestamp("created_at").toInstant(),
                    resultSet.getString("thumbnail_url"),
                    resultSet.getString("caption"),
                    resultSet.getString("author"),
                    resultSet.getString("extraction_status"),
                    resultSet.getString("shared_url")
            );

    private final JdbcTemplate jdbcTemplate;

    public ShareDao(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public Optional<ShareResultProjection> findShareResult(Long memberId, Long sharedMediaId) {
        String sql = """
                SELECT sm.id AS shared_media_id,
                       sm.created_at,
                       m.thumbnail_url,
                       m.caption,
                       m.author,
                       m.extraction_status,
                       m.failure_reason,
                       sm.shared_url
                FROM shared_media sm
                JOIN media m ON m.id = sm.media_id
                WHERE sm.member_id = ?
                  AND sm.id = ?
                """;
        return jdbcTemplate.query(sql, SHARE_RESULT_ROW_MAPPER, memberId, sharedMediaId)
                .stream()
                .findFirst();
    }

    public List<ShareProjection> findShares(Long memberId) {
        String sql = """
                SELECT sm.id AS shared_media_id,
                       sm.created_at,
                       m.thumbnail_url,
                       m.caption,
                       m.author,
                       m.extraction_status,
                       sm.shared_url
                FROM shared_media sm
                JOIN media m ON m.id = sm.media_id
                WHERE sm.member_id = ?
                ORDER BY sm.created_at DESC, sm.id DESC
                """;
        return jdbcTemplate.query(sql, SHARE_ROW_MAPPER, memberId);
    }
}
