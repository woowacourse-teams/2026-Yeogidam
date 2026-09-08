package com.yeogidam.media.repository;

import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * media_place 연결 행. 추출 사실(미디어와 장소의 연결)과 사용자 해석(decision_status)이 함께 산다.
 * 결정 전이는 조건부 UPDATE가 guard를 겸한다.
 */
@Repository
public class MediaPlaceDao {

    private final JdbcTemplate jdbcTemplate;

    public MediaPlaceDao(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public void insert(
            Long mediaId,
            Long placeId,
            int position
    ) {
        String sql = "INSERT INTO media_place (media_id, place_id, position) VALUES (?, ?, ?)";
        jdbcTemplate.update(sql, mediaId, placeId, position);
    }

    public void copyLinks(
            Long sourceMediaId,
            Long targetMediaId
    ) {
        String sql = """
                INSERT INTO media_place (media_id, place_id, position)
                SELECT ?, place_id, position FROM media_place WHERE media_id = ?
                """;
        jdbcTemplate.update(sql, targetMediaId, sourceMediaId);
    }

    public List<Long> findPlaceIdsByMediaId(Long mediaId) {
        String sql = "SELECT place_id FROM media_place WHERE media_id = ? ORDER BY position";
        return jdbcTemplate.queryForList(sql, Long.class, mediaId);
    }

    public void markSaved(
            Long mediaId,
            List<Long> placeIds
    ) {
        updateDecisionStatus(mediaId, placeIds, "SAVED");
    }

    public void markDiscarded(
            Long mediaId,
            List<Long> placeIds
    ) {
        updateDecisionStatus(mediaId, placeIds, "DISCARDED");
    }

    private void updateDecisionStatus(
            Long mediaId,
            List<Long> placeIds,
            String decisionStatus
    ) {
        String sql = """
                UPDATE media_place SET decision_status = ?, decided_at = CURRENT_TIMESTAMP
                WHERE media_id = ? AND place_id = ? AND decision_status = 'UNDECIDED'
                """;
        List<Object[]> arguments = placeIds.stream()
                .map(placeId -> new Object[]{decisionStatus, mediaId, placeId})
                .toList();
        jdbcTemplate.batchUpdate(sql, arguments);
    }

    public int unsave(
            Long userId,
            Long placeId
    ) {
        String sql = """
                UPDATE media_place SET decision_status = 'UNDECIDED', decided_at = NULL
                WHERE place_id = ? AND decision_status = 'SAVED'
                  AND media_id IN (SELECT id FROM instagram_media WHERE user_id = ?)
                """;
        return jdbcTemplate.update(sql, placeId, userId);
    }

    public boolean existsSavedForUser(
            Long userId,
            Long placeId
    ) {
        String sql = """
                SELECT COUNT(*) FROM media_place AS mp
                INNER JOIN instagram_media AS m ON m.id = mp.media_id
                WHERE mp.place_id = ? AND mp.decision_status = 'SAVED' AND m.user_id = ?
                """;
        Integer count = jdbcTemplate.queryForObject(sql, Integer.class, placeId, userId);
        return count != null && count > 0;
    }

    public void deleteAllByMediaId(Long mediaId) {
        String sql = "DELETE FROM media_place WHERE media_id = ?";
        jdbcTemplate.update(sql, mediaId);
    }
}
