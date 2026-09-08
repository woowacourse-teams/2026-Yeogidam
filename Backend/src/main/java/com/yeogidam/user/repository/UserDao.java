package com.yeogidam.user.repository;

import java.sql.PreparedStatement;
import java.util.Objects;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

@Repository
public class UserDao {

    private static final RowMapper<UserRecord> USER_ROW_MAPPER = (resultSet, rowNumber) -> new UserRecord(
            resultSet.getLong("id"),
            resultSet.getString("nickname"),
            resultSet.getTimestamp("created_at").toLocalDateTime());

    private final JdbcTemplate jdbcTemplate;

    public UserDao(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public Long insert(String nickname) {
        String sql = "INSERT INTO users (nickname) VALUES (?)";
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

    public Optional<UserRecord> findById(Long userId) {
        String sql = "SELECT * FROM users WHERE id = ?";
        return jdbcTemplate.query(sql, USER_ROW_MAPPER, userId).stream()
                .findFirst();
    }
}
