package com.yeogidam.member.domain;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

class OAuthAccountTest {

    @Test
    void 제공자와_식별자로_계정을_만든다() {
        assertThatCode(() -> new OAuthAccount(OAuthProvider.APPLE, "001234.abc"))
                .doesNotThrowAnyException();
    }

    @Test
    void 제공자가_없으면_예외가_발생한다() {
        assertThatThrownBy(() -> new OAuthAccount(null, "kakao-1"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {" "})
    void 식별자가_비어_있으면_예외가_발생한다(String providerUserId) {
        assertThatThrownBy(() -> new OAuthAccount(OAuthProvider.KAKAO, providerUserId))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 식별자가_255바이트를_넘으면_예외가_발생한다() {
        // given
        String tooLong = "가".repeat(86);

        // when & then
        assertThatThrownBy(() -> new OAuthAccount(OAuthProvider.KAKAO, tooLong))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
