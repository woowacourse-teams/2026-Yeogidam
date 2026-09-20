package com.yeogidam.member.repository;

import com.yeogidam.member.domain.Member;
import com.yeogidam.member.domain.MemberProfile;
import com.yeogidam.member.domain.OAuthAccount;
import com.yeogidam.member.domain.OAuthProvider;
import java.nio.charset.StandardCharsets;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.simple.SimpleJdbcInsert;
import org.springframework.stereotype.Repository;

@Repository
public class MemberDao {

    private static final RowMapper<Member> ROW_MAPPER = (resultSet, rowNumber) -> new Member(
            resultSet.getLong("id"),
            new MemberProfile(
                    resultSet.getString("nickname"),
                    resultSet.getString("email"),
                    resultSet.getString("image_url")
            ),
            new OAuthAccount(
                    OAuthProvider.valueOf(resultSet.getString("oauth_provider")),
                    new String(resultSet.getBytes("provider_user_id"), StandardCharsets.UTF_8)
            )
    );

    private final JdbcTemplate jdbcTemplate;
    private final SimpleJdbcInsert jdbcInsert;

    public MemberDao(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
        this.jdbcInsert = new SimpleJdbcInsert(jdbcTemplate)
                .withTableName("members")
                .usingColumns(
                        "oauth_provider",
                        "provider_user_id",
                        "nickname",
                        "email",
                        "image_url"
                )
                .usingGeneratedKeyColumns("id");
    }

    public Optional<Member> findById(Long id) {
        String sql = """
                SELECT *
                FROM members
                WHERE id = ?
                """;
        return jdbcTemplate.query(sql, ROW_MAPPER, id)
                .stream()
                .findFirst();
    }

    public Optional<Member> findByOAuthAccount(OAuthAccount account) {
        String sql = """
                SELECT *
                FROM members
                WHERE oauth_provider = ?
                  AND provider_user_id = ?
                """;
        return findByOAuthAccount(sql, account);
    }

    /**
     * 잠금 읽기. 같은 계정의 동시 첫 로그인에서 DuplicateKeyException을 받은 트랜잭션이
     * 스냅샷 대신 다른 트랜잭션이 막 커밋한 행을 읽어 프로필 갱신으로 이어 가게 한다.
     */
    public Optional<Member> findByOAuthAccountForUpdate(OAuthAccount account) {
        String sql = """
                SELECT *
                FROM members
                WHERE oauth_provider = ?
                  AND provider_user_id = ?
                FOR UPDATE
                """;
        return findByOAuthAccount(sql, account);
    }

    private Optional<Member> findByOAuthAccount(String sql, OAuthAccount account) {
        return jdbcTemplate.query(sql, ROW_MAPPER, account.provider().name(),
                        account.providerUserId().getBytes(StandardCharsets.UTF_8))
                .stream()
                .findFirst();
    }

    public Member save(Member member) {
        MapSqlParameterSource parameters = new MapSqlParameterSource()
                .addValue("oauth_provider", member.oauthAccount().provider().name())
                .addValue("provider_user_id",
                        member.oauthAccount().providerUserId().getBytes(StandardCharsets.UTF_8))
                .addValue("nickname", member.nickname())
                .addValue("email", member.profile().email())
                .addValue("image_url", member.profile().imageUrl());
        Number generatedId = jdbcInsert.executeAndReturnKey(parameters);
        return new Member(generatedId.longValue(), member.profile(), member.oauthAccount());
    }

    public void update(Member member) {
        String sql = """
                UPDATE members
                SET nickname = ?,
                    email = ?,
                    image_url = ?
                WHERE id = ?
                """;
        jdbcTemplate.update(sql, member.nickname(), member.profile().email(), member.profile().imageUrl(), member.id());
    }

    public void deleteById(Long id) {
        String sql = """
                DELETE FROM members
                WHERE id = ?
                """;
        jdbcTemplate.update(sql, id);
    }
}
