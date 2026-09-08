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

    /**
     * 재공유가 이전 공유들의 미결정 후보를 닫는다. 저장·버림 이력(SAVED, DISCARDED)은 남는다.
     */
    public int supersedeUndecided(
            Long memberId,
            Long mediaId
    ) {
        String sql = """
                UPDATE share_place SET decision_status = 'SUPERSEDED', decided_at = CURRENT_TIMESTAMP
                WHERE decision_status = 'UNDECIDED'
                  AND share_id IN (SELECT id FROM media_share WHERE member_id = ? AND media_id = ?)
                """;
        return jdbcTemplate.update(sql, memberId, mediaId);
    }

    public void deleteAllByMediaId(Long mediaId) {
        String sql = """
                DELETE FROM share_place
                WHERE share_id IN (SELECT id FROM media_share WHERE media_id = ?)
                """;
        jdbcTemplate.update(sql, mediaId);
    }
}
