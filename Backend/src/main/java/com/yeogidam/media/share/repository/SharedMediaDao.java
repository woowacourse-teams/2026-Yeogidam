package com.yeogidam.media.share.repository;

import com.yeogidam.media.extraction.domain.ExtractionFailureReason;
import com.yeogidam.media.extraction.domain.ExtractionSnapshot;
import com.yeogidam.media.extraction.domain.ExtractionStatus;
import com.yeogidam.media.extraction.domain.MediaSourceType;
import com.yeogidam.media.instagram.domain.InstagramUrl;
import com.yeogidam.media.share.domain.ExtractionRetrySource;
import com.yeogidam.media.share.domain.SharedInstagramMedia;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.util.List;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class SharedMediaDao {

    private static final RowMapper<ExtractionRetrySource> RETRY_SOURCE_ROW_MAPPER = (resultSet, rowNumber) ->
            new ExtractionRetrySource(
                    resultSet.getLong("media_id"),
                    new InstagramUrl(resultSet.getString("shared_url")),
                    new ExtractionSnapshot(
                            ExtractionStatus.valueOf(resultSet.getString("extraction_status")),
                            failureReason(resultSet),
                            resultSet.getInt("extraction_version"),
                            MediaSourceType.valueOf(resultSet.getString("source_type"))
                    )
            );

    private static final RowMapper<SharedMediaOwnerProjection> OWNER_ROW_MAPPER = (resultSet, rowNumber) ->
            new SharedMediaOwnerProjection(
                    resultSet.getLong("shared_media_id"),
                    resultSet.getLong("member_id")
            );

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

    private static ExtractionFailureReason failureReason(ResultSet resultSet) throws SQLException {
        String reason = resultSet.getString("failure_reason");
        if (reason == null) {
            return null;
        }
        return ExtractionFailureReason.valueOf(reason);
    }

    public Long save(SharedInstagramMedia sharedInstagramMedia) {
        String sql = """
                INSERT INTO shared_media (
                    member_id, media_id, shared_url,
                    extraction_status, failure_reason, extraction_version
                )
                SELECT ?, m.id, ?, m.extraction_status, m.failure_reason, m.extraction_version
                FROM media m
                WHERE m.id = ?
                """;
        KeyHolder keyHolder = new GeneratedKeyHolder();
        int insertedRows = jdbcTemplate.update(connection -> {
            PreparedStatement statement = connection.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS);
            statement.setLong(1, sharedInstagramMedia.getMemberId());
            statement.setString(2, sharedInstagramMedia.getInstagramUrl().getSharedUrl());
            statement.setLong(3, sharedInstagramMedia.getMediaId());
            return statement;
        }, keyHolder);
        if (insertedRows != 1 || keyHolder.getKey() == null) {
            throw new IllegalStateException("공유할 게시물의 분석 상태를 저장하지 못했습니다.");
        }
        return keyHolder.getKey().longValue();
    }

    public void updatePendingExtractions(Long mediaId) {
        String sql = """
                UPDATE shared_media sm
                JOIN media m ON m.id = sm.media_id
                SET sm.extraction_status = m.extraction_status,
                    sm.failure_reason = m.failure_reason,
                    sm.extraction_version = m.extraction_version
                WHERE sm.media_id = ?
                  AND sm.extraction_status = 'EXTRACTING'
                """;
        jdbcTemplate.update(sql, mediaId);
    }

    public Optional<ExtractionRetrySource> findRetrySource(Long memberId, Long sharedMediaId) {
        String sql = """
                SELECT sm.media_id,
                       sm.shared_url,
                       sm.extraction_status,
                       sm.failure_reason,
                       sm.extraction_version,
                       m.source_type
                FROM shared_media sm
                JOIN media m ON m.id = sm.media_id
                WHERE sm.member_id = ? AND sm.id = ?
                """;
        return jdbcTemplate.query(sql, RETRY_SOURCE_ROW_MAPPER, memberId, sharedMediaId)
                .stream()
                .findFirst();
    }

    /**
     * 회원이 이 게시물을 공유한 이력이 있는지 본다. 같은 게시물을 여러 번 공유했으면 가장 나중 이력의 id를 돌려준다.
     */
    public Optional<Long> findShareIdByMemberAndMedia(Long memberId, Long mediaId) {
        String sql = """
                SELECT id
                FROM shared_media
                WHERE member_id = ?
                  AND media_id = ?
                ORDER BY id DESC
                LIMIT 1
                """;
        return jdbcTemplate.queryForList(sql, Long.class, memberId, mediaId)
                .stream()
                .findFirst();
    }

    public Optional<Long> findExtractingShareId(Long memberId, Long mediaId) {
        String sql = """
                SELECT id
                FROM shared_media
                WHERE member_id = ?
                  AND media_id = ?
                  AND extraction_status = 'EXTRACTING'
                ORDER BY id DESC
                LIMIT 1
                """;
        return jdbcTemplate.queryForList(sql, Long.class, memberId, mediaId)
                .stream()
                .findFirst();
    }

    public List<SharedMediaOwnerProjection> findLatestSharesByMediaId(Long mediaId) {
        String sql = """
                SELECT sm.id AS shared_media_id,
                       sm.member_id
                FROM shared_media sm
                WHERE sm.media_id = ?
                  AND sm.extraction_status = 'EXTRACTING'
                  AND NOT EXISTS (
                      SELECT 1
                      FROM shared_media newer
                      WHERE newer.member_id = sm.member_id
                        AND newer.media_id = sm.media_id
                        AND newer.id > sm.id
                  )
                ORDER BY sm.id
                """;
        return jdbcTemplate.query(sql, OWNER_ROW_MAPPER, mediaId);
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
                       sm.extraction_status,
                       sm.failure_reason,
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
     * 커서가 가리키는 공유보다 오래된 공유를 다음 페이지로 읽는다. 공유 시각이 같으면 ID가 작은 공유를 더 오래된 공유로 본다.
     */
    public ShareHistoryProjections findShareHistoryBefore(Long memberId, ShareHistoryCursor cursor) {
        String sql = """
                SELECT sm.id AS shared_media_id,
                       sm.created_at,
                       m.thumbnail_key,
                       m.caption,
                       m.author,
                       sm.extraction_status,
                       sm.failure_reason,
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

    public Optional<ExtractionStatus> findStatusByMemberAndSharedMediaId(Long memberId, Long sharedMediaId) {
        String sql = """
                SELECT extraction_status
                FROM shared_media
                WHERE member_id = ? AND id = ?
                """;
        return jdbcTemplate.query(sql,
                        (resultSet, rowNumber) -> ExtractionStatus.valueOf(resultSet.getString("extraction_status")),
                        memberId, sharedMediaId)
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
