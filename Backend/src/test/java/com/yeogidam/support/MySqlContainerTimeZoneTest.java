package com.yeogidam.support;

import static com.yeogidam.support.fixture.sql.MemberSqlFixture.insertKakaoMember;
import static com.yeogidam.support.fixture.sql.PlaceSqlFixture.insertPlaceWithRequiredColumnsOnly;
import static com.yeogidam.support.fixture.sql.SavedPlaceSqlFixture.insertSavedPlace;
import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

class MySqlContainerTimeZoneTest extends JdbcTestSupport {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void 테스트_커넥션의_세션_시간대가_UTC다() {
        String timeZone = jdbcTemplate.queryForObject("SELECT @@session.time_zone", String.class);

        assertThat(timeZone).isEqualTo("+00:00");
    }

    @Test
    void 저장한_TIMESTAMP를_DB에서_UTC_기준으로_조회한다() {
        // given
        insertKakaoMember(jdbcTemplate, 1L, "user-1", "user-1", "user-1@example.com", null);
        insertPlaceWithRequiredColumnsOnly(
                jdbcTemplate,
                1L,
                "place-1",
                "테스트 장소",
                "서울",
                new BigDecimal("37.5000"),
                new BigDecimal("127.0000")
        );
        insertSavedPlace(jdbcTemplate, 11L, 1L, 1L, Instant.parse("2026-09-15T00:00:00.123456Z"));

        // when: DB가 문자열을 만들어 반환해 JDBC의 Timestamp 변환을 거치지 않는다.
        String stored = jdbcTemplate.queryForObject(
                """
                        SELECT DATE_FORMAT(last_saved_at, '%Y-%m-%d %H:%i:%s.%f')
                        FROM saved_places
                        WHERE id = 11
                        """,
                String.class
        );

        // then
        assertThat(stored).isEqualTo("2026-09-15 00:00:00.123456");
    }
}
