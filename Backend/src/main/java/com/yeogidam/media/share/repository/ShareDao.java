package com.yeogidam.media.share.repository;

import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

@Repository
public class ShareDao {

    private static final RowMapper<ShareResultProjection> SHARE_RESULT_ROW_MAPPER = (resultSet, rowNumber) ->
            new ShareResultProjection(
                    resultSet.getLong("shared_media_id"),
                    resultSet.getTimestamp("shared_at").toInstant(),
                    resultSet.getString("thumbnail_url"),
                    resultSet.getString("caption"),
                    resultSet.getString("author"),
                    resultSet.getString("extraction_status"),
                    resultSet.getString("failure_reason"),
                    resultSet.getString("original_url")
            );

    private final JdbcTemplate jdbcTemplate;

    public ShareDao(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public Optional<ShareResultProjection> findShareResult(Long memberId, Long sharedMediaId) {
        String sql = """
                SELECT sm.id AS shared_media_id,
                       sm.created_at AS shared_at,
                       m.thumbnail_url,
                       m.caption,
                       m.author,
                       m.extraction_status,
                       m.failure_reason,
                       sm.shared_url AS original_url
                FROM shared_media sm
                JOIN media m ON m.id = sm.media_id
                WHERE sm.member_id = ?
                  AND sm.id = ?
                """;
        return jdbcTemplate.query(sql, SHARE_RESULT_ROW_MAPPER, memberId, sharedMediaId)
                .stream()
                .findFirst();
    }
}
