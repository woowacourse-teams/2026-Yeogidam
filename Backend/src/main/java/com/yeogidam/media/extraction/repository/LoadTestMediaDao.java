package com.yeogidam.media.extraction.repository;

import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
@ConditionalOnProperty(name = "media.extraction.load-test.enabled", havingValue = "true")
public class LoadTestMediaDao {

    private final JdbcTemplate jdbcTemplate;

    public List<Long> findMemberIds(Long mediaId) {
        String sql = """
                SELECT DISTINCT member_id FROM shared_media WHERE media_id = ?
                """;
        return jdbcTemplate.queryForList(sql, Long.class, mediaId);
    }
}
