package com.yeogidam.member.service;

import static com.yeogidam.support.fixture.sql.MemberSqlFixture.insertKakaoMember;
import static com.yeogidam.support.fixture.sql.RefreshSessionSqlFixture.insertRefreshSession;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertAll;

import com.yeogidam.auth.exception.AuthErrorCode;
import com.yeogidam.auth.exception.AuthException;
import com.yeogidam.auth.repository.RefreshSessionDao;
import com.yeogidam.member.repository.MemberDao;
import com.yeogidam.support.fake.FakeOAuthClientConfig;
import com.yeogidam.support.IntegrationTestSupport;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

@Import(FakeOAuthClientConfig.class)
class MemberIntegrationTest extends IntegrationTestSupport {

    private static final Instant EXPIRES_AT = Instant.parse("2026-10-15T00:00:00Z");

    @Autowired
    private MemberService memberService;

    @Autowired
    private MemberDao memberDao;

    @Autowired
    private RefreshSessionDao refreshSessionDao;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void 탈퇴하면_회원과_모든_리프레시_세션을_삭제한다() {
        // given
        insertKakaoMember(jdbcTemplate, 1L, "delete-user", "delete-user",
                "delete-user@example.com", "https://img.example.com/delete-user");
        insertRefreshSession(jdbcTemplate, 1L, "session-1", 1L, "hash-1", EXPIRES_AT, false);
        insertRefreshSession(jdbcTemplate, 2L, "session-2", 1L, "hash-2", EXPIRES_AT, false);

        // when
        memberService.deleteMember(1L, "delete-user");

        // then
        assertAll(
                () -> assertThat(memberDao.findById(1L)).isEmpty(),
                () -> assertThat(refreshSessionDao.findBySessionId("session-1")).isEmpty(),
                () -> assertThat(refreshSessionDao.findBySessionId("session-2")).isEmpty()
        );
    }

    @Test
    void OAuth_제공자_연결_해제에_실패하면_예외가_발생한다() {
        // given
        insertKakaoMember(jdbcTemplate, 1L, "provider-unavailable-user", "provider-unavailable-user",
                "provider-unavailable-user@example.com", "https://img.example.com/provider-unavailable-user");
        insertRefreshSession(jdbcTemplate, 1L, "session-1", 1L, "hash-1", EXPIRES_AT, false);

        // when
        assertThatThrownBy(() -> memberService.deleteMember(1L, "unavailable-code"))
                .isInstanceOf(AuthException.class)
                .extracting("errorCode")
                .isEqualTo(AuthErrorCode.PROVIDER_UNAVAILABLE);

        // then
        assertAll(
                () -> assertThat(memberDao.findById(1L)).isPresent(),
                () -> assertThat(refreshSessionDao.findBySessionId("session-1")).isPresent(),
                () -> assertThat(memberCount()).isEqualTo(1L)
        );
    }

    @Test
    void 인가_코드가_다른_회원이면_예외가_발생한다() {
        // given
        insertKakaoMember(jdbcTemplate, 1L, "delete-target", "delete-target",
                "delete-target@example.com", "https://img.example.com/delete-target");
        insertRefreshSession(jdbcTemplate, 1L, "session-1", 1L, "hash-1", EXPIRES_AT, false);

        // when
        assertThatThrownBy(() -> memberService.deleteMember(1L, "another-user"))
                .isInstanceOf(AuthException.class)
                .extracting("errorCode")
                .isEqualTo(AuthErrorCode.INVALID_CREDENTIAL);

        // then
        assertAll(
                () -> assertThat(memberDao.findById(1L)).isPresent(),
                () -> assertThat(refreshSessionDao.findBySessionId("session-1")).isPresent()
        );
    }

    private long memberCount() {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM members", Long.class);
    }
}
