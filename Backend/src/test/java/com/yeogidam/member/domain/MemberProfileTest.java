package com.yeogidam.member.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertAll;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

class MemberProfileTest {

    @Test
    void 앞뒤_공백은_잘라내고_값만_담는다() {
        // when
        MemberProfile profile = new MemberProfile(" 빈 ", " bean@example.com ", " https://img.example.com/1 ");

        // then
        assertAll(
                () -> assertThat(profile.nickname()).isEqualTo("빈"),
                () -> assertThat(profile.email()).isEqualTo("bean@example.com"),
                () -> assertThat(profile.imageUrl()).isEqualTo("https://img.example.com/1")
        );
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"   "})
    void 비어_있는_값은_null로_정규화한다(String blank) {
        // when
        MemberProfile profile = new MemberProfile(blank, blank, blank);

        // then
        assertAll(
                () -> assertThat(profile.nickname()).isNull(),
                () -> assertThat(profile.email()).isNull(),
                () -> assertThat(profile.imageUrl()).isNull()
        );
    }

    @Test
    void 닉네임이_없으면_전달받은_닉네임으로_채운다() {
        // given
        MemberProfile profile = new MemberProfile(null, "bean@example.com", null);

        // when
        MemberProfile filled = profile.withNicknameIfAbsent("담이 1234");

        // then
        assertThat(filled).isEqualTo(new MemberProfile("담이 1234", "bean@example.com", null));
    }

    @Test
    void 닉네임이_이미_있으면_전달받은_닉네임을_쓰지_않는다() {
        // given
        MemberProfile profile = new MemberProfile("빈", "bean@example.com", null);

        // when
        MemberProfile filled = profile.withNicknameIfAbsent("담이 1234");

        // then
        assertThat(filled.nickname()).isEqualTo("빈");
    }

    @Test
    void 갱신할_때_닉네임은_두고_이메일과_이미지는_제공자_값을_따른다() {
        // given
        MemberProfile existing = new MemberProfile("빈", "bean@example.com", "https://img.example.com/1");
        MemberProfile provided = new MemberProfile("정콩", null, "https://img.example.com/2");

        // when
        MemberProfile updated = existing.updatedBy(provided);

        // then
        assertThat(updated).isEqualTo(new MemberProfile("빈", null, "https://img.example.com/2"));
    }

    @Test
    void 닉네임이_비어_있던_프로필은_갱신할_때_제공자_닉네임으로_채운다() {
        // given
        MemberProfile existing = new MemberProfile(null, "bean@example.com", null);
        MemberProfile provided = new MemberProfile("정콩", "bean@example.com", null);

        // when
        MemberProfile updated = existing.updatedBy(provided);

        // then
        assertThat(updated.nickname()).isEqualTo("정콩");
    }
}
