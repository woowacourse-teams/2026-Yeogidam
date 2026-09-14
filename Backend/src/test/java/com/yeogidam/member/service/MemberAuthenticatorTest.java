package com.yeogidam.member.service;

import static com.yeogidam.support.MemberFixture.kakaoAccount;
import static com.yeogidam.support.MemberFixture.profile;
import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertAll;

import com.yeogidam.member.domain.Member;
import com.yeogidam.member.domain.MemberProfile;
import com.yeogidam.member.domain.OAuthAccount;
import com.yeogidam.member.domain.OAuthProvider;
import com.yeogidam.member.repository.MemberRepository;
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
    private MemberRepository memberRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void 없는_계정이면_회원을_만든다() {
        // when
        Member member = memberAuthenticator.authenticate(ACCOUNT, profile("빈"));

        // then
        Member saved = memberRepository.findByOAuthAccount(ACCOUNT).orElseThrow();
        assertAll(
                () -> assertThat(saved.id()).isEqualTo(member.id()),
                () -> assertThat(saved.nickname()).isEqualTo("빈"),
                () -> assertThat(saved.profile().email()).isEqualTo("빈@example.com")
        );
    }

    @Test
    void 있는_계정이면_회원을_다시_만들지_않고_최신_프로필로_갱신한다() {
        // given
        Member created = memberAuthenticator.authenticate(ACCOUNT, profile("빈"));

        // when
        Member again = memberAuthenticator.authenticate(ACCOUNT, profile("새이름"));

        // then
        Member saved = memberRepository.findByOAuthAccount(ACCOUNT).orElseThrow();
        assertAll(
                () -> assertThat(again.id()).isEqualTo(created.id()),
                () -> assertThat(saved.nickname()).isEqualTo("새이름"),
                () -> assertThat(memberCount()).isEqualTo(1)
        );
    }

    @Test
    void 재로그인에_선택_정보가_없으면_DB의_프로필도_비운다() {
        // given
        memberAuthenticator.authenticate(ACCOUNT, profile("빈"));

        // when
        memberAuthenticator.authenticate(ACCOUNT, new MemberProfile(null, null, null));

        // then
        Member saved = memberRepository.findByOAuthAccount(ACCOUNT).orElseThrow();
        assertAll(
                () -> assertThat(saved.nickname()).isNull(),
                () -> assertThat(saved.profile().email()).isNull(),
                () -> assertThat(saved.profile().imageUrl()).isNull()
        );
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
