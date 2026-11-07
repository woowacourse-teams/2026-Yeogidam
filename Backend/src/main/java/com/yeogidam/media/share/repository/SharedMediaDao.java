package com.yeogidam.media.share.repository;

import com.yeogidam.media.extraction.domain.ExtractionFailureReason;
import com.yeogidam.media.extraction.domain.ExtractionSnapshot;
import com.yeogidam.media.extraction.domain.ExtractionStatus;
import com.yeogidam.media.extraction.domain.MediaSourceType;
import com.yeogidam.media.instagram.domain.InstagramUrl;
import com.yeogidam.media.share.domain.ExtractionRetrySource;
import com.yeogidam.media.share.domain.SharedInstagramMedia;
import com.yeogidam.search.domain.SearchQuery;
import com.yeogidam.search.repository.SearchSql;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
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
                    resultSet.getString("shared_url"),
                    resultSet.getBoolean("reported"),
                    toInstantOrNull(resultSet.getTimestamp("deleted_at"))
            );

    private static final RowMapper<SavedMediaProjection> SAVED_MEDIA_ROW_MAPPER = (resultSet, rowNumber) ->
            new SavedMediaProjection(
                    resultSet.getLong("shared_media_id"),
                    resultSet.getLong("media_id"),
                    resultSet.getTimestamp("created_at").toInstant(),
                    resultSet.getString("thumbnail_key"),
                    resultSet.getString("caption"),
                    resultSet.getString("author"),
                    resultSet.getString("shared_url"),
                    resultSet.getBoolean("reported")
            );

    private final JdbcTemplate jdbcTemplate;
    private final NamedParameterJdbcTemplate namedParameterJdbcTemplate;

    private static ExtractionFailureReason failureReason(ResultSet resultSet) throws SQLException {
        String reason = resultSet.getString("failure_reason");
        if (reason == null) {
            return null;
        }
        return ExtractionFailureReason.valueOf(reason);
    }

    private static Instant toInstantOrNull(Timestamp timestamp) {
        if (timestamp == null) {
            return null;
        }
        return timestamp.toInstant();
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

    /**
     * 재시도가 이어받을 회원의 분석 중인 공유를 읽는다.
     * 지운 공유를 이어받으면 추출이 끝나도 장소가 붙지 않으므로, 지운 공유는 읽지 않고 재시도가 새 공유를 만들게 한다.
     */
    public Optional<Long> findExtractingShareId(Long memberId, Long mediaId) {
        String sql = """
                SELECT id
                FROM shared_media
                WHERE member_id = ?
                  AND media_id = ?
                  AND extraction_status = 'EXTRACTING'
                  AND deleted_at IS NULL
                ORDER BY id DESC
                LIMIT 1
                """;
        return jdbcTemplate.queryForList(sql, Long.class, memberId, mediaId)
                .stream()
                .findFirst();
    }

    /**
     * 추출이 끝난 게시물의 장소를 붙일 공유를 회원마다 가장 나중 공유 한 건씩 읽는다. 지운 공유에는 장소를 붙이지 않는다.
     */
    public List<SharedMediaOwnerProjection> findLatestSharesByMediaId(Long mediaId) {
        String sql = """
                SELECT sm.id AS shared_media_id,
                       sm.member_id
                FROM shared_media sm
                WHERE sm.media_id = ?
                  AND sm.extraction_status = 'EXTRACTING'
                  AND sm.deleted_at IS NULL
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
     * 공유마다 제보 여부와 지운 시각을 함께 읽는다. 지운 공유도 목록에 남기고, 지운 시각은 지우지 않은 공유면 null이다.
     * 제보 여부는 SELECT 절의 하위 쿼리라서, MySQL이 정렬과 LIMIT을 마친 페이지 행에만 유니크 인덱스로 한 번씩 실행한다.
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
                       sm.shared_url,
                       sm.deleted_at,
                       EXISTS (
                           SELECT 1
                           FROM shared_media_reports smr
                           WHERE smr.shared_media_id = sm.id
                       ) AS reported
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
     * 제보 여부와 지운 시각은 첫 페이지(findShareHistory)와 같은 규칙으로 읽는다.
     */
    public ShareHistoryProjections findShareHistoryBefore(Long memberId, SharedMediaCursor cursor) {
        String sql = """
                SELECT sm.id AS shared_media_id,
                       sm.created_at,
                       m.thumbnail_key,
                       m.caption,
                       m.author,
                       sm.extraction_status,
                       sm.failure_reason,
                       sm.shared_url,
                       sm.deleted_at,
                       EXISTS (
                           SELECT 1
                           FROM shared_media_reports smr
                           WHERE smr.shared_media_id = sm.id
                       ) AS reported
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

    /** 보관함 게시물 탭의 첫 페이지를 읽는다. */
    public SavedMediaProjections findSavedMedia(Long memberId) {
        return findLatestSavedMedia(memberId, "", List.of());
    }

    /** 커서가 가리키는 공유보다 오래된 보관함 게시물을 읽는다. */
    public SavedMediaProjections findSavedMediaBefore(Long memberId, SharedMediaCursor cursor) {
        return findLatestSavedMedia(memberId, savedMediaCursorCondition(), savedMediaCursorArguments(cursor));
    }

    /**
     * 고른 공유 가운데 지우지 않은 내 공유의 게시물 ID를 중복 없이 읽는다. 남의 공유와 이미 지운 공유는 member_id와 deleted_at 조건에 걸려 빠진다.
     */
    public List<Long> findMediaIdsByMemberAndIds(Long memberId, List<Long> sharedMediaIds) {
        String sql = """
                SELECT DISTINCT media_id
                FROM shared_media
                WHERE member_id = :memberId
                  AND id IN (:sharedMediaIds)
                  AND deleted_at IS NULL
                ORDER BY media_id
                """;
        return namedParameterJdbcTemplate.queryForList(sql, Map.of(
                "memberId", memberId,
                "sharedMediaIds", sharedMediaIds
        ), Long.class);
    }

    /**
     * 체크 켜기가 장소를 저장할 공유의 게시물 ID를 읽는다. 지우지 않았고 분석에 성공한 내 공유만 읽는다.
     * 게시물 탭, 장소 상세 릴스, 게시글 삭제의 남은 게시글과 같은 기준이라, 실패한 공유에 연결이 생겨 어느 화면에도 없는 장소가 보관함에 남지 않는다.
     */
    public Optional<Long> findSucceededMediaIdByMemberAndId(Long memberId, Long sharedMediaId) {
        String sql = """
                SELECT media_id
                FROM shared_media
                WHERE member_id = ?
                  AND id = ?
                  AND deleted_at IS NULL
                  AND extraction_status = 'SUCCEEDED'
                """;
        return jdbcTemplate.queryForList(sql, Long.class, memberId, sharedMediaId)
                .stream()
                .findFirst();
    }

    /**
     * 고른 게시물마다 회원의 공유를 모두 지운 것으로 표시한다(soft delete). 게시물 탭은 게시물마다 최신 공유 한 건만 보여 주므로, 한 건만 지우면 예전 공유가 대신 올라온다.
     * 이미 지운 공유는 처음 지운 시각을 그대로 둔다.
     */
    public void softDeleteByMemberAndMediaIds(Long memberId, List<Long> mediaIds, Instant deletedAt) {
        String sql = """
                UPDATE shared_media
                SET deleted_at = :deletedAt
                WHERE member_id = :memberId
                  AND media_id IN (:mediaIds)
                  AND deleted_at IS NULL
                """;
        namedParameterJdbcTemplate.update(sql, Map.of(
                "deletedAt", Timestamp.from(deletedAt),
                "memberId", memberId,
                "mediaIds", mediaIds
        ));
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

    /**
     * 보관함 게시물 목록과 같은 적격 공유 중 게시물별 최신 한 건을 먼저 고른 뒤 전체 캡션을 검색한다.
     * 보관 장소와의 연결은 보지 않고, 모든 검색 단어가 포함된 게시물만 페이지 크기보다 한 건 더 읽는다.
     */
    public SavedMediaProjections findSavedMediaByQuery(Long memberId, SearchQuery query) {
        List<String> patterns = query.likePatterns();
        return findLatestSavedMedia(memberId, captionSearchConditions(patterns.size()), patterns);
    }

    /**
     * 대표 공유를 고른 뒤 검색과 커서를 적용하므로 앞 페이지에 나온 게시물의 옛 공유는 다시 나오지 않는다.
     */
    public SavedMediaProjections findSavedMediaByQueryBefore(
            Long memberId,
            SearchQuery query,
            SharedMediaCursor cursor
    ) {
        List<String> patterns = query.likePatterns();
        List<Object> arguments = new ArrayList<>(patterns);
        arguments.addAll(savedMediaCursorArguments(cursor));
        String conditions = captionSearchConditions(patterns.size()) + savedMediaCursorCondition();
        return findLatestSavedMedia(memberId, conditions, arguments);
    }

    /**
     * 지우지 않았고 분석에 성공했으며 추출 장소가 있는 내 공유 중 게시물마다 최신 한 건을 고른다.
     * 보관 장소 연결은 보지 않고, 공유 시각이 같으면 ID가 큰 공유를 우선한다.
     * 대표 공유를 고른 뒤 캡션과 커서를 적용하고, 대표 공유 ID로 제보 여부를 읽는다.
     */
    private SavedMediaProjections findLatestSavedMedia(
            Long memberId,
            String conditions,
            List<?> conditionArguments
    ) {
        String sql = """
                SELECT latest.shared_media_id,
                       latest.media_id,
                       latest.created_at,
                       m.thumbnail_key,
                       m.caption,
                       m.author,
                       latest.shared_url,
                       EXISTS (
                           SELECT 1
                           FROM shared_media_reports smr
                           WHERE smr.shared_media_id = latest.shared_media_id
                       ) AS reported
                FROM (
                    SELECT sm.id AS shared_media_id,
                           sm.media_id,
                           sm.created_at,
                           sm.shared_url,
                           ROW_NUMBER() OVER (
                               PARTITION BY sm.media_id
                               ORDER BY sm.created_at DESC, sm.id DESC
                           ) AS recency_rank
                    FROM shared_media sm
                    WHERE sm.member_id = ?
                      AND sm.deleted_at IS NULL
                      AND sm.extraction_status = 'SUCCEEDED'
                      AND EXISTS (
                          SELECT 1
                          FROM media_places mp
                          WHERE mp.media_id = sm.media_id
                      )
                ) latest
                JOIN media m ON m.id = latest.media_id
                WHERE latest.recency_rank = 1
                %s
                ORDER BY latest.created_at DESC, latest.shared_media_id DESC
                LIMIT ?
                """.formatted(conditions);
        List<Object> arguments = new ArrayList<>();
        arguments.add(memberId);
        arguments.addAll(conditionArguments);
        arguments.add(SavedMediaProjections.FETCH_SIZE);
        return new SavedMediaProjections(jdbcTemplate.query(sql, SAVED_MEDIA_ROW_MAPPER, arguments.toArray()));
    }

    private String captionSearchConditions(int patternCount) {
        return ("AND " + SearchSql.containsCondition("m.caption") + "\n").repeat(patternCount);
    }

    private String savedMediaCursorCondition() {
        return """
                AND (latest.created_at < ?
                     OR (latest.created_at = ? AND latest.shared_media_id < ?))
                """;
    }

    private List<Object> savedMediaCursorArguments(SharedMediaCursor cursor) {
        Timestamp cursorCreatedAt = Timestamp.from(cursor.createdAt());
        return List.of(cursorCreatedAt, cursorCreatedAt, cursor.sharedMediaId());
    }
}
