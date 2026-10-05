package com.yeogidam.member.service;

import static com.yeogidam.support.fixture.MemberFixture.kakaoAccount;
import static com.yeogidam.support.fixture.MemberFixture.profile;
import static com.yeogidam.support.fixture.sql.MemberSqlFixture.insertKakaoMember;
import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertAll;

import com.yeogidam.member.domain.Member;
import com.yeogidam.member.domain.MemberProfile;
import com.yeogidam.member.domain.OAuthAccount;
import com.yeogidam.member.domain.OAuthProvider;
import com.yeogidam.member.repository.MemberDao;
import com.yeogidam.support.IntegrationTestSupport;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 회원 생성과 프로필 갱신은 DB 상태로만 드러나므로 서비스와 DB 통합으로 검증하고 롤백으로 격리한다.
 */
class MemberAuthenticatorTest extends IntegrationTestSupport {

    private static final OAuthAccount ACCOUNT = kakaoAccount("kakao-1");

    @Autowired
    private MemberAuthenticator memberAuthenticator;

    @Autowired
    private MemberDao memberDao;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void 없는_계정이면_회원을_만든다() {
        // when
        Member member = memberAuthenticator.authenticate(ACCOUNT, profile("빈"));

        // then
        Member saved = memberDao.findByOAuthAccount(ACCOUNT).orElseThrow();
        assertAll(
                () -> assertThat(saved.id()).isEqualTo(member.id()),
                () -> assertThat(saved.profile().nickname()).isEqualTo("빈"),
                () -> assertThat(saved.profile().email()).isEqualTo("빈@example.com")
        );
    }

    @Test
    void 있는_계정이면_회원을_다시_만들지_않고_닉네임은_두고_이메일과_이미지를_갱신한다() {
        // given
        Member created = memberAuthenticator.authenticate(ACCOUNT, profile("빈"));

        // when
        Member again = memberAuthenticator.authenticate(ACCOUNT, profile("새이름"));

        // then
        Member saved = memberDao.findByOAuthAccount(ACCOUNT).orElseThrow();
        assertAll(
                () -> assertThat(again.id()).isEqualTo(created.id()),
                () -> assertThat(saved.profile().nickname()).isEqualTo("빈"),
                () -> assertThat(saved.profile().email()).isEqualTo("새이름@example.com"),
                () -> assertThat(saved.profile().imageUrl()).isEqualTo("https://img.example.com/새이름"),
                () -> assertThat(memberCount()).isEqualTo(1)
        );
    }

    @Test
    void 재로그인에_제공자가_정보를_주지_않으면_이메일과_이미지만_비우고_닉네임은_둔다() {
        // given
        memberAuthenticator.authenticate(ACCOUNT, profile("빈"));

        // when
        memberAuthenticator.authenticate(ACCOUNT, new MemberProfile(null, null, null));

        // then
        Member saved = memberDao.findByOAuthAccount(ACCOUNT).orElseThrow();
        assertAll(
                () -> assertThat(saved.profile().nickname()).isEqualTo("빈"),
                () -> assertThat(saved.profile().email()).isNull(),
                () -> assertThat(saved.profile().imageUrl()).isNull()
        );
    }

    @Test
    void 제공자가_닉네임을_주지_않으면_담이_닉네임으로_가입한다() {
        // when
        memberAuthenticator.authenticate(ACCOUNT, new MemberProfile(null, "빈@example.com", null));

        // then
        Member saved = memberDao.findByOAuthAccount(ACCOUNT).orElseThrow();
        assertThat(saved.profile().nickname()).matches("담이 \\d{4}");
    }

    @Test
    void 닉네임이_비어_있던_기존_회원은_다시_로그인할_때_닉네임을_채운다() {
        // given: 랜덤 닉네임을 넣기 전에 닉네임 없이 가입한 회원이다
        insertKakaoMember(jdbcTemplate, 1L, "kakao-1", null, null, null);

        // when
        memberAuthenticator.authenticate(ACCOUNT, new MemberProfile(null, null, null));

        // then
        Member saved = memberDao.findByOAuthAccount(ACCOUNT).orElseThrow();
        assertThat(saved.profile().nickname()).matches("담이 \\d{4}");
    }

    @Test
    void 제공자_식별자가_같아도_제공자가_다르면_별도_회원이다() {
        // when
        Member kakao = memberAuthenticator.authenticate(ACCOUNT, profile("빈"));
        Member google = memberAuthenticator.authenticate(
                new OAuthAccount(OAuthProvider.GOOGLE, "kakao-1"), profile("빈"));

        // then
        assertAll(
                () -> assertThat(google.id()).isNotEqualTo(kakao.id()),
                () -> assertThat(memberCount()).isEqualTo(2)
        );
    }

    private long memberCount() {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM members", Long.class);
    }
}
