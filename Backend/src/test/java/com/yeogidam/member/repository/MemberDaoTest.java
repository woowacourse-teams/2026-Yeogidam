package com.yeogidam.member.repository;

import static com.yeogidam.support.fixture.MemberFixture.kakaoMember;
import static com.yeogidam.support.fixture.MemberFixture.profile;
import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertAll;

import com.yeogidam.member.domain.Member;
import com.yeogidam.member.domain.OAuthAccount;
import com.yeogidam.member.domain.OAuthProvider;
import com.yeogidam.support.JdbcTestSupport;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.jdbc.Sql;

/**
 * DB 쿼리와 매핑이 실제 MySQL에서 동작하는지 검증한다. 읽기 검증은 SQL fixture로 행을 심는다.
 */
@Import(MemberDao.class)
class MemberDaoTest extends JdbcTestSupport {

    private static final OAuthAccount KAKAO_ACCOUNT = new OAuthAccount(OAuthProvider.KAKAO, "kakao-1");

    @Autowired
    private MemberDao memberDao;

    @Test
    @Sql("/single-member.sql")
    void OAuth_계정으로_회원을_읽으면_모든_열이_매핑된다() {
        // when
        Member member = memberDao.findByOAuthAccount(KAKAO_ACCOUNT).orElseThrow();

        // then
        assertAll(
                () -> assertThat(member.id()).isEqualTo(1L),
                () -> assertThat(member.nickname()).isEqualTo("빈"),
                () -> assertThat(member.profile().email()).isEqualTo("bean@example.com"),
                () -> assertThat(member.profile().imageUrl()).isEqualTo("https://img.example.com/bean"),
                () -> assertThat(member.oauthAccount()).isEqualTo(KAKAO_ACCOUNT)
        );
    }

    @Test
    @Sql("/single-member.sql")
    void OAuth_계정_조회는_제공자와_식별자가_모두_같아야_하고_식별자의_대소문자를_구분한다() {
        assertAll(
                () -> assertThat(memberDao.findByOAuthAccount(new OAuthAccount(OAuthProvider.GOOGLE, "kakao-1")))
                        .isEmpty(),
                () -> assertThat(memberDao.findByOAuthAccount(new OAuthAccount(OAuthProvider.KAKAO, "KAKAO-1")))
                        .isEmpty(),
                () -> assertThat(memberDao.findByOAuthAccountForUpdate(KAKAO_ACCOUNT)).isPresent()
        );
    }

    @Test
    @Sql("/single-member.sql")
    void 식별자로_회원을_읽으면_모든_열이_매핑된다() {
        // when
        Member member = memberDao.findById(1L).orElseThrow();

        // then
        assertAll(
                () -> assertThat(member.id()).isEqualTo(1L),
                () -> assertThat(member.nickname()).isEqualTo("빈"),
                () -> assertThat(member.profile().email()).isEqualTo("bean@example.com"),
                () -> assertThat(member.profile().imageUrl()).isEqualTo("https://img.example.com/bean"),
                () -> assertThat(member.oauthAccount()).isEqualTo(KAKAO_ACCOUNT)
        );
    }

    @Test
    @Sql("/single-member.sql")
    void 없는_식별자로_읽으면_빈_값이다() {
        assertThat(memberDao.findById(999L)).isEmpty();
    }

    @Test
    void 저장하면_생성된_식별자를_돌려주고_같은_계정으로_다시_읽힌다() {
        // when
        Member saved = memberDao.save(kakaoMember("kakao-2"));

        // then
        Member found = memberDao.findByOAuthAccount(saved.oauthAccount()).orElseThrow();
        assertAll(
                () -> assertThat(saved.id()).isNotNull(),
                () -> assertThat(found.id()).isEqualTo(saved.id()),
                () -> assertThat(found.nickname()).isEqualTo("kakao-2")
        );
    }

    @Test
    @Sql("/single-member.sql")
    void 갱신하면_프로필_세_열이_바뀐다() {
        // given
        Member member = memberDao.findByOAuthAccount(KAKAO_ACCOUNT).orElseThrow();
        member.updateProfile(profile("새이름"));

        // when
        memberDao.update(member);

        // then
        Member updated = memberDao.findByOAuthAccount(KAKAO_ACCOUNT).orElseThrow();
        assertAll(
                () -> assertThat(updated.nickname()).isEqualTo("새이름"),
                () -> assertThat(updated.profile().email()).isEqualTo("새이름@example.com"),
                () -> assertThat(updated.profile().imageUrl()).isEqualTo("https://img.example.com/새이름")
        );
    }
}
