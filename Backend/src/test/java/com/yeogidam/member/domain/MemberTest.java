package com.yeogidam.member.domain;

import static org.junit.jupiter.api.Assertions.*;

import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;

class MemberTest {

    @Test
    void 닉네임을_포함한_선택_정보가_없어도_회원을_생성한다() {
        // given
        MemberProfile profile = new MemberProfile(null, null, null);

        // when
        Member member = new Member(profile, new OAuthAccount(OAuthProvider.APPLE, "apple-user"));

        // then
        assertAll(
                () -> Assertions.assertThat(member.nickname())
                        .isNull(),
                () -> Assertions.assertThat(member.profile()
                                .email())
                        .isNull(),
                () -> Assertions.assertThat(member.profile()
                                .imageUrl())
                        .isNull()
        );
    }

    @Test
    void 이메일과_사진이_없어도_회원을_생성한다() {
        // given
        MemberProfile profile = new MemberProfile("러키", null, null);

        // when
        Member member = new Member(profile, new OAuthAccount(OAuthProvider.APPLE, "apple-user"));

        // then
        assertAll(
                () -> Assertions.assertThat(member.nickname())
                        .isEqualTo("러키"),
                () -> Assertions.assertThat(member.profile()
                                .email())
                        .isNull(),
                () -> Assertions.assertThat(member.profile()
                                .imageUrl())
                        .isNull()
        );
    }

    @Test
    void 재로그인에_선택_정보가_없으면_기존_정보도_비운다() {
        // given
        MemberProfile profile = new MemberProfile("내 닉네임", "user@example.com",
                "https://image.example.com/a");
        Member member = new Member(1L, profile, new OAuthAccount(OAuthProvider.GOOGLE, "user"));

        // when
        member.updateProfile(new MemberProfile(null, null, null));

        // then
        assertAll(
                () -> Assertions.assertThat(member.nickname())
                        .isNull(),
                () -> Assertions.assertThat(member.profile()
                                .email())
                        .isNull(),
                () -> Assertions.assertThat(member.profile()
                                .imageUrl())
                        .isNull()
        );
    }

    @Test
    void 재로그인하면_기존_프로필을_최신_정보로_갱신한다() {
        // given
        Member member = new Member(
                1L,
                new MemberProfile("러키", "old@example.com", "https://image.example.com/original"),
                new OAuthAccount(OAuthProvider.GOOGLE, "user")
        );

        // when
        member.updateProfile(new MemberProfile("새 이름", "user@example.com", "https://image.example.com/new"));

        // then
        assertAll(
                () -> Assertions.assertThat(member.nickname())
                        .isEqualTo("새 이름"),
                () -> Assertions.assertThat(member.profile()
                                .email())
                        .isEqualTo("user@example.com"),
                () -> Assertions.assertThat(member.profile()
                                .imageUrl())
                        .isEqualTo("https://image.example.com/new")
        );
    }

    @Test
    void 선택_정보의_빈_문자열은_null로_정규화한다() {
        // when
        MemberProfile profile = new MemberProfile("러키", " ", "");

        // then
        assertAll(
                () -> Assertions.assertThat(profile.email())
                        .isNull(),
                () -> Assertions.assertThat(profile.imageUrl())
                        .isNull()
        );
    }
}
