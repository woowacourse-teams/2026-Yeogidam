package com.yeogidam.member.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertAll;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

class MemberProfileTest {

    @Test
    void 앞뒤_공백을_지워_담는다() {
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
}
