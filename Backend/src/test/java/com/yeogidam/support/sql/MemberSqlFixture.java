package com.yeogidam.support.sql;

import org.springframework.jdbc.core.JdbcTemplate;

/**
 * members 행을 DAO를 거치지 않고 직접 넣는다. 테스트가 given에서 필요한 회원만 만든다.
 */
public final class MemberSqlFixture {

    private MemberSqlFixture() {
    }

    public static void insertKakaoMember(
            JdbcTemplate jdbcTemplate,
            Long memberId,
            String providerUserId,
            String nickname,
            String email,
            String imageUrl
    ) {
        jdbcTemplate.update("""
                INSERT INTO members (id, oauth_provider, provider_user_id, nickname, email, image_url)
                VALUES (?, 'KAKAO', ?, ?, ?, ?)
                """,
                memberId, providerUserId, nickname, email, imageUrl
        );
    }
}
