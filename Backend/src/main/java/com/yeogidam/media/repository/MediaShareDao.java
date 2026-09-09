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
            SELECT s.id AS share_id, s.member_id, s.media_id, s.shared_url, s.created_at AS shared_at,
                   m.title, m.caption, m.thumbnail_url, m.author_username,
                   m.extraction_status, m.failure_reason, m.processing_version
            FROM media_share AS s
            INNER JOIN instagram_media AS m
              ON m.id = s.media_id
            """;

    private static final RowMapper<MediaShareProjection> VIEW_ROW_MAPPER = (resultSet, rowNumber) ->
            new MediaShareProjection(
                    resultSet.getLong("share_id"),
                    resultSet.getLong("member_id"),
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
            Long memberId,
            Long mediaId,
            String sharedUrl
    ) {
        String sql = "INSERT INTO media_share (member_id, media_id, shared_url) VALUES (?, ?, ?)";
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(connection -> {
            var statement = connection.prepareStatement(sql, new String[]{"id"});
            statement.setLong(1, memberId);
            statement.setLong(2, mediaId);
            statement.setString(3, sharedUrl);
            return statement;
        }, keyHolder);
        return Objects.requireNonNull(keyHolder.getKey()).longValue();
    }

    public Optional<MediaShareProjection> findViewById(Long shareId) {
        String sql = VIEW_SELECT + "WHERE s.id = ?";
        return jdbcTemplate.query(sql, VIEW_ROW_MAPPER, shareId).stream()
                .findFirst();
    }

    public List<MediaShareProjection> findAllByMemberId(Long memberId) {
        String sql = VIEW_SELECT + "WHERE s.member_id = ? ORDER BY s.created_at DESC, s.id DESC";
        return jdbcTemplate.query(sql, VIEW_ROW_MAPPER, memberId);
    }

    /**
     * 핀의 원본 릴스 목록. 그 장소를 저장하게 된 공유 건들을 연결 테이블로 따라가되,
     * 같은 릴스를 여러 공유에서 저장했으면 릴스당 최신 공유 한 건만 보여준다(mediaCount와 같은 셈).
     */
    public List<MediaShareProjection> findAllSavedByPlaceForMember(
            Long memberId,
            Long placeId
    ) {
        String sql = VIEW_SELECT + """
                INNER JOIN saved_place_share AS link
                  ON link.share_id = s.id
                INNER JOIN saved_place AS saved
                  ON saved.id = link.saved_place_id
                WHERE saved.place_id = ? AND saved.member_id = ?
                  AND s.id = (SELECT MAX(latest.id) FROM media_share AS latest
                              INNER JOIN saved_place_share AS latestLink
                                ON latestLink.share_id = latest.id
                              WHERE latestLink.saved_place_id = saved.id
                                AND latest.media_id = s.media_id)
                ORDER BY s.created_at DESC, s.id DESC
                """;
        return jdbcTemplate.query(sql, VIEW_ROW_MAPPER, placeId, memberId);
    }

    /**
     * 추출 성공 시 후보를 발급받을 공유 건들. 후보가 이미 있는 공유는 제외하고,
     * 추출 중 재공유로 대체된 지나간 공유는 후보를 받지 않도록 member별 최신 건만 고른다.
     */
    public List<Long> findIdsWithoutCandidatesByMediaId(Long mediaId) {
        String sql = """
                SELECT s.id FROM media_share AS s
                WHERE s.media_id = ?
                  AND NOT EXISTS (SELECT 1 FROM share_place AS sp WHERE sp.share_id = s.id)
                  AND s.id = (SELECT MAX(latest.id) FROM media_share AS latest
                              WHERE latest.media_id = s.media_id AND latest.member_id = s.member_id)
                """;
        return jdbcTemplate.queryForList(sql, Long.class, mediaId);
    }
}
