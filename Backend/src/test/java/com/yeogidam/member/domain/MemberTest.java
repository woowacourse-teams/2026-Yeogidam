package com.yeogidam.member.domain;

import static com.yeogidam.support.fixture.MemberFixture.kakaoAccount;
import static com.yeogidam.support.fixture.MemberFixture.profile;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertAll;

import org.junit.jupiter.api.Test;

class MemberTest {

    @Test
    void 프로필과_OAuth_계정으로_회원을_만든다() {
        // when
        Member member = new Member(profile("빈"), kakaoAccount("kakao-1"));

        // then
        assertAll(
                () -> assertThat(member.id()).isNull(),
                () -> assertThat(member.nickname()).isEqualTo("빈"),
                () -> assertThat(member.oauthAccount()).isEqualTo(kakaoAccount("kakao-1"))
        );
    }

    @Test
    void 프로필을_갱신하면_계정은_그대로고_프로필만_바뀐다() {
        // given
        Member member = new Member(1L, profile("빈"), kakaoAccount("kakao-1"));

        // when
        member.updateProfile(profile("새이름"));

        // then
        assertAll(
                () -> assertThat(member.nickname()).isEqualTo("새이름"),
                () -> assertThat(member.oauthAccount()).isEqualTo(kakaoAccount("kakao-1"))
        );
    }

    @Test
    void 프로필이나_계정이_없으면_예외가_발생한다() {
        assertAll(
                () -> assertThatThrownBy(() -> new Member(null, kakaoAccount("kakao-1")))
                        .isInstanceOf(IllegalArgumentException.class),
                () -> assertThatThrownBy(() -> new Member(profile("빈"), null))
                        .isInstanceOf(IllegalArgumentException.class)
        );
    }
}
