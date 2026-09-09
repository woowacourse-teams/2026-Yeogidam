package com.yeogidam.member.repository;

import com.yeogidam.member.domain.Member;
import java.sql.PreparedStatement;
import java.sql.SQLException;
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
            resultSet.getString("oauth_provider"),
            resultSet.getString("oauth_provider_user_id"),
            resultSet.getTimestamp("created_at").toLocalDateTime());

    private final JdbcTemplate jdbcTemplate;

    public MemberDao(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public Long insert(Member member) {
        String sql = "INSERT INTO member (nickname, oauth_provider, oauth_provider_user_id) VALUES (?, ?, ?)";
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(
                connection -> prepareInsert(connection.prepareStatement(sql, new String[]{"id"}), member),
                keyHolder);
        return Objects.requireNonNull(keyHolder.getKey()).longValue();
    }

    private PreparedStatement prepareInsert(
            PreparedStatement statement,
            Member member
    ) throws SQLException {
        statement.setString(1, member.nickname().value());
        statement.setString(2, member.oauthAccount().provider().name());
        statement.setString(3, member.oauthAccount().providerUserId());
        return statement;
    }

    public Optional<MemberRecord> findById(Long memberId) {
        String sql = "SELECT * FROM member WHERE id = ?";
        return jdbcTemplate.query(sql, MEMBER_ROW_MAPPER, memberId).stream()
                .findFirst();
    }
}
