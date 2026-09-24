package com.yeogidam.support.fixture.sql;

import java.sql.Timestamp;
import java.time.Instant;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * saved_places 행을 DAO를 거치지 않고 직접 넣는다. 저장 시각은 Instant로 쓴다.
 */
public final class SavedPlaceSqlFixture {

    private SavedPlaceSqlFixture() {
    }

    public static void insertSavedPlace(
            JdbcTemplate jdbcTemplate,
            Long savedPlaceId,
            Long memberId,
            Long placeId,
            Instant lastSavedAt
    ) {
        jdbcTemplate.update("""
                INSERT INTO saved_places (id, member_id, place_id, last_saved_at)
                VALUES (?, ?, ?, ?)
                """,
                savedPlaceId, memberId, placeId, Timestamp.from(lastSavedAt)
        );
    }
}
