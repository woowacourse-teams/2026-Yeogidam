package com.yeogidam.media.share.repository;

import com.yeogidam.media.share.domain.SharedMediaReport;
import java.sql.Timestamp;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.simple.SimpleJdbcInsert;
import org.springframework.stereotype.Repository;

@Repository
public class SharedMediaReportDao {

    private final SimpleJdbcInsert jdbcInsert;

    public SharedMediaReportDao(JdbcTemplate jdbcTemplate) {
        this.jdbcInsert = new SimpleJdbcInsert(jdbcTemplate)
                .withTableName("shared_media_reports")
                .usingColumns("shared_media_id", "created_at")
                .usingGeneratedKeyColumns("id");
    }

    public Long save(SharedMediaReport report) {
        MapSqlParameterSource parameters = new MapSqlParameterSource()
                .addValue("shared_media_id", report.sharedMediaId())
                .addValue("created_at", Timestamp.from(report.createdAt()));
        return jdbcInsert.executeAndReturnKey(parameters).longValue();
    }
}
