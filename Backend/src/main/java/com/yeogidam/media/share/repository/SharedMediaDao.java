package com.yeogidam.media.share.repository;

import com.yeogidam.media.share.domain.SharedInstagramMedia;
import java.sql.Timestamp;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.simple.SimpleJdbcInsert;
import org.springframework.stereotype.Repository;

@Repository
public class SharedMediaDao {

    private static final RowMapper<ShareHistoryProjection> SHARE_ROW_MAPPER = (resultSet, rowNumber) ->
            new ShareHistoryProjection(
                    resultSet.getLong("shared_media_id"),
                    resultSet.getTimestamp("created_at").toInstant(),
                    resultSet.getString("thumbnail_key"),
                    resultSet.getString("caption"),
                    resultSet.getString("author"),
                    resultSet.getString("extraction_status"),
                    resultSet.getString("failure_reason"),
                    resultSet.getString("shared_url")
            );

    private final JdbcTemplate jdbcTemplate;
    private final SimpleJdbcInsert jdbcInsert;

    public SharedMediaDao(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
        this.jdbcInsert = new SimpleJdbcInsert(jdbcTemplate)
                .withTableName("shared_media")
                .usingColumns("member_id", "media_id", "shared_url")
                .usingGeneratedKeyColumns("id");
    }

    public Long save(SharedInstagramMedia sharedInstagramMedia) {
        MapSqlParameterSource parameters = new MapSqlParameterSource()
                .addValue("member_id", sharedInstagramMedia.memberId())
                .addValue("media_id", sharedInstagramMedia.mediaId())
                .addValue("shared_url", sharedInstagramMedia.instagramUrl().getSharedUrl());
        return jdbcInsert.executeAndReturnKey(parameters).longValue();
    }

    /**
     * 히스토리 첫 페이지를 읽는다. 다음 페이지가 있는지 알 수 있게 페이지 크기보다 한 건 더 읽는다.
     */
    public ShareHistoryProjections findShareHistory(Long memberId) {
        String sql = """
                SELECT sm.id AS shared_media_id,
                       sm.created_at,
                       m.thumbnail_key,
                       m.caption,
                       m.author,
                       m.extraction_status,
                       m.failure_reason,
                       sm.shared_url
                FROM shared_media sm
                JOIN media m ON m.id = sm.media_id
                WHERE sm.member_id = ?
                ORDER BY sm.created_at DESC, sm.id DESC
                LIMIT ?
                """;
        return new ShareHistoryProjections(jdbcTemplate.query(
                sql, SHARE_ROW_MAPPER, memberId, ShareHistoryProjections.FETCH_SIZE));
    }

    /**
     * 커서가 가리키는 공유보다 오래된 공유를 다음 페이지로 읽는다.
     * 공유 시각이 같으면 ID가 작은 공유를 더 오래된 공유로 본다.
     */
    public ShareHistoryProjections findShareHistoryBefore(Long memberId, ShareHistoryCursor cursor) {
        String sql = """
                SELECT sm.id AS shared_media_id,
                       sm.created_at,
                       m.thumbnail_key,
                       m.caption,
                       m.author,
                       m.extraction_status,
                       m.failure_reason,
                       sm.shared_url
                FROM shared_media sm
                JOIN media m ON m.id = sm.media_id
                WHERE sm.member_id = ?
                  AND (sm.created_at < ?
                       OR (sm.created_at = ? AND sm.id < ?))
                ORDER BY sm.created_at DESC, sm.id DESC
                LIMIT ?
                """;
        Timestamp cursorCreatedAt = Timestamp.from(cursor.createdAt());
        return new ShareHistoryProjections(jdbcTemplate.query(
                sql, SHARE_ROW_MAPPER, memberId, cursorCreatedAt, cursorCreatedAt, cursor.sharedMediaId(),
                ShareHistoryProjections.FETCH_SIZE));
    }

    public Optional<ShareHistoryProjection> findShareHistoryItem(Long memberId, Long sharedMediaId) {
        String sql = """
                SELECT sm.id AS shared_media_id,
                       sm.created_at,
                       m.thumbnail_key,
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
        return jdbcTemplate.query(sql, SHARE_ROW_MAPPER, memberId, sharedMediaId)
                .stream()
                .findFirst();
    }

    public boolean existsByMemberIdAndSharedMediaId(Long memberId, Long sharedMediaId) {
        String sql = """
                SELECT EXISTS (
                    SELECT 1
                    FROM shared_media
                    WHERE member_id = ?
                      AND id = ?
                )
                """;
        return jdbcTemplate.queryForObject(sql, Boolean.class, memberId, sharedMediaId);
    }
}
