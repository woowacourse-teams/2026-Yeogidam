package com.yeogidam.support.fixture.sql;

import org.springframework.jdbc.core.JdbcTemplate;

public final class MemberFixture {

    private MemberFixture() {
    }

    public static void createMember(JdbcTemplate jdbcTemplate, Long memberId, String providerUserId) {
        jdbcTemplate.update("""
                INSERT INTO members (
                    id, oauth_provider, provider_user_id, nickname, email, image_url
                )
                VALUES (?, 'KAKAO', ?, ?, ?, ?)
                """, memberId, providerUserId, providerUserId,
                providerUserId + "@example.com", "https://img.example.com/" + providerUserId);
    }
}
