package com.yeogidam.media.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class InstagramMediaReportDao {

    private final JdbcTemplate jdbcTemplate;

    public InstagramMediaReportDao(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public void insert(Long mediaId) {
        String sql = "INSERT INTO instagram_media_report (media_id) VALUES (?)";
        jdbcTemplate.update(sql, mediaId);
    }
}
