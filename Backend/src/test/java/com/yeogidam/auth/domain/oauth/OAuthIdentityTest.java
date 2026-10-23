package com.yeogidam.auth.domain.oauth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertAll;

import com.yeogidam.auth.exception.AuthErrorCode;
import com.yeogidam.auth.exception.AuthException;
import com.yeogidam.member.domain.OAuthAccount;
import com.yeogidam.member.domain.OAuthProvider;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

class OAuthIdentityTest {

    @Test
    void 제공자_식별자로_계정을_만들고_선택_정보는_프로필에_담는다() {
        // when
        OAuthIdentity identity = new OAuthIdentity(OAuthProvider.KAKAO, "123", " 빈 ", "bean@example.com", null);

        // then
        assertAll(
                () -> assertThat(identity.getAccount()).isEqualTo(new OAuthAccount(OAuthProvider.KAKAO, "123")),
                () -> assertThat(identity.getProfile().nickname()).isEqualTo("빈"),
                () -> assertThat(identity.getProfile().email()).isEqualTo("bean@example.com"),
                () -> assertThat(identity.getProfile().imageUrl()).isNull()
        );
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {" "})
    void 제공자_식별자가_비어_있으면_자격증명_예외가_발생한다(String providerUserId) {
        assertThatThrownBy(() -> new OAuthIdentity(OAuthProvider.KAKAO, providerUserId, "빈", null, null))
                .isInstanceOf(AuthException.class)
                .extracting("errorCode")
                .isEqualTo(AuthErrorCode.INVALID_CREDENTIAL);
    }
}
