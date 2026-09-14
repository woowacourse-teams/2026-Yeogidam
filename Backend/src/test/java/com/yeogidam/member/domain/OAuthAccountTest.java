package com.yeogidam.member.domain;

import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;

class OAuthAccountTest {

    @Test
    void UTF8_255바이트인_식별자를_그대로_보관한다() {
        // given
        String identifier = "가".repeat(85);

        // when
        OAuthAccount account = new OAuthAccount(OAuthProvider.GOOGLE, identifier);

        // then
        Assertions.assertThat(account.providerUserId())
                .isEqualTo(identifier);
    }

    @Test
    void 문자_수와_관계없이_UTF8_255바이트를_넘으면_예외가_발생한다() {
        // given
        String identifier = "가".repeat(86);

        // when & then
        Assertions.assertThatIllegalArgumentException()
                .isThrownBy(() -> new OAuthAccount(OAuthProvider.GOOGLE, identifier));
    }
}
