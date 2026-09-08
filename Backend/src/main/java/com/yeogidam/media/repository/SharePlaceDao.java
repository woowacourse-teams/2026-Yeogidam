package com.yeogidam.media.repository;

import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * share_place 행. 공유 건에 발급된 대기함 후보와 사용자 결정이 산다.
 * 후보는 추출 사실(media_place)을 복사해 UNDECIDED로 태어나고, 결정 전이는 조건부 UPDATE가 guard를 겸한다.
 */
@Repository
public class SharePlaceDao {

    private final JdbcTemplate jdbcTemplate;

    public SharePlaceDao(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public void issueCandidates(
            Long shareId,
            Long mediaId
    ) {
        String sql = """
                INSERT INTO share_place (share_id, place_id, position)
                SELECT ?, place_id, position FROM media_place WHERE media_id = ?
                """;
        jdbcTemplate.update(sql, shareId, mediaId);
    }

    public void markSaved(
            Long shareId,
            List<Long> placeIds
    ) {
        updateDecisionStatus(shareId, placeIds, "SAVED");
    }

    public void markDiscarded(
            Long shareId,
            List<Long> placeIds
    ) {
        updateDecisionStatus(shareId, placeIds, "DISCARDED");
    }

    private void updateDecisionStatus(
            Long shareId,
            List<Long> placeIds,
            String decisionStatus
    ) {
        String sql = """
                UPDATE share_place SET decision_status = ?, decided_at = CURRENT_TIMESTAMP
                WHERE share_id = ? AND place_id = ? AND decision_status = 'UNDECIDED'
                """;
        List<Object[]> arguments = placeIds.stream()
                .map(placeId -> new Object[]{decisionStatus, shareId, placeId})
                .toList();
        jdbcTemplate.batchUpdate(sql, arguments);
    }

    public int unsave(
            Long userId,
            Long placeId
    ) {
        String sql = """
                UPDATE share_place SET decision_status = 'UNDECIDED', decided_at = NULL
                WHERE place_id = ? AND decision_status = 'SAVED'
                  AND share_id IN (SELECT id FROM media_share WHERE user_id = ?)
                """;
        return jdbcTemplate.update(sql, placeId, userId);
    }

    public boolean existsSavedForUser(
            Long userId,
            Long placeId
    ) {
        String sql = """
                SELECT COUNT(*) FROM share_place AS sp
                INNER JOIN media_share AS s ON s.id = sp.share_id
                WHERE sp.place_id = ? AND sp.decision_status = 'SAVED' AND s.user_id = ?
                """;
        Integer count = jdbcTemplate.queryForObject(sql, Integer.class, placeId, userId);
        return count != null && count > 0;
    }

    public void deleteAllByMediaId(Long mediaId) {
        String sql = """
                DELETE FROM share_place
                WHERE share_id IN (SELECT id FROM media_share WHERE media_id = ?)
                """;
        jdbcTemplate.update(sql, mediaId);
    }
}
