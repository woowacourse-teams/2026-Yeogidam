package com.yeogidam.media.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class MediaShareReportDao {

    private final JdbcTemplate jdbcTemplate;

    public MediaShareReportDao(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public void insert(Long shareId) {
        String sql = "INSERT INTO media_share_report (share_id) VALUES (?)";
        jdbcTemplate.update(sql, shareId);
    }
}
