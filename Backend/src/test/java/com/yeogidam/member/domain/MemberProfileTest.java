package com.yeogidam.member.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.*;

import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

class MemberProfileTest {

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {" ", "\t\n", "\u2003"})
    void 프로필_정보가_비어_있으면_null로_보관한다(String value) {
        // when
        MemberProfile profile = new MemberProfile(value, value, value);

        // then
        assertAll(
                () -> assertThat(profile.nickname())
                        .isNull(),
                () -> assertThat(profile.email())
                        .isNull(),
                () -> assertThat(profile.imageUrl())
                        .isNull()
        );
    }

    @Test
    void 프로필_정보의_앞뒤_공백만_제거한다() {
        // when
        MemberProfile profile = new MemberProfile("  러키 😀  ", " user@example.com ", " https://image.example.com/a ");

        // then
        assertAll(
                () -> assertThat(profile.nickname())
                        .isEqualTo("러키 😀"),
                () -> assertThat(profile.email())
                        .isEqualTo("user@example.com"),
                () -> assertThat(profile.imageUrl())
                        .isEqualTo("https://image.example.com/a")
        );
    }

    @Test
    void 프로필_객체는_길이에_관계없이_정보를_보관한다() {
        // given
        String nickname = "😀".repeat(256);
        String email = "a".repeat(309) + "@example.com";
        String imageUrl = "https://image.example.com/" + "a".repeat(2048);

        // when
        MemberProfile profile = new MemberProfile(nickname, email, imageUrl);

        // then
        assertAll(
                () -> assertThat(profile.nickname())
                        .isEqualTo(nickname),
                () -> assertThat(profile.email())
                        .isEqualTo(email),
                () -> assertThat(profile.imageUrl())
                        .isEqualTo(imageUrl)
        );
    }
}
