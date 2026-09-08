package com.yeogidam.member.repository;

import java.sql.PreparedStatement;
import java.util.Objects;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

@Repository
public class MemberDao {

    private static final RowMapper<MemberRecord> MEMBER_ROW_MAPPER = (resultSet, rowNumber) -> new MemberRecord(
            resultSet.getLong("id"),
            resultSet.getString("nickname"),
            resultSet.getTimestamp("created_at").toLocalDateTime());

    private final JdbcTemplate jdbcTemplate;

    public MemberDao(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public Long insert(String nickname) {
        String sql = "INSERT INTO member (nickname) VALUES (?)";
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(
                connection -> prepareInsert(connection.prepareStatement(sql, new String[]{"id"}), nickname),
                keyHolder);
        return Objects.requireNonNull(keyHolder.getKey()).longValue();
    }

    private PreparedStatement prepareInsert(
            PreparedStatement statement,
            String nickname
    ) throws java.sql.SQLException {
        statement.setString(1, nickname);
        return statement;
    }

    public Optional<MemberRecord> findById(Long memberId) {
        String sql = "SELECT * FROM member WHERE id = ?";
        return jdbcTemplate.query(sql, MEMBER_ROW_MAPPER, memberId).stream()
                .findFirst();
    }
}
