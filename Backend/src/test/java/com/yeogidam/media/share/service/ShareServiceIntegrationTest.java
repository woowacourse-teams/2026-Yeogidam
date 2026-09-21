package com.yeogidam.media.share.service;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.yeogidam.media.share.exception.ShareException;
import com.yeogidam.support.IntegrationTestSupport;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

class ShareServiceIntegrationTest extends IntegrationTestSupport {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ShareService shareService;

    @Test
    void 서비스는_없는_공유를_조회하면_예외가_발생한다() {
        // given
        insertMember(6L, "share-service-missing-user");

        // when & then
        assertThatThrownBy(() -> shareService.readShareHistoryDetail(6L, 99L))
                .isInstanceOf(ShareException.class)
                .hasMessage("존재하지 않는 공유입니다.");
    }

    private void insertMember(Long memberId, String providerUserId) {
        jdbcTemplate.update("""
                        INSERT INTO members (
                            id, oauth_provider, provider_user_id, nickname, email, image_url
                        )
                        VALUES (?, 'KAKAO', ?, ?, ?, ?)
                        """, memberId, providerUserId, providerUserId,
                providerUserId + "@example.com", "https://img.example.com/" + providerUserId);
    }

}
