package com.yeogidam.auth.domain.oauth;

import com.yeogidam.auth.exception.AuthErrorCode;
import com.yeogidam.auth.exception.AuthException;
import com.yeogidam.member.domain.MemberProfile;
import com.yeogidam.member.domain.OAuthAccount;
import com.yeogidam.member.domain.OAuthProvider;
import lombok.Getter;

@Getter
public class OAuthIdentity {

    private final OAuthAccount account;
    private final MemberProfile profile;

    public OAuthIdentity(
            OAuthProvider provider,
            String providerUserId,
            String nickname,
            String email,
            String imageUrl
    ) {
        validateIdentifier(providerUserId);
        this.account = new OAuthAccount(provider, providerUserId);
        this.profile = new MemberProfile(nickname, email, imageUrl);
    }

    private void validateIdentifier(String identifier) {
        if (identifier == null || identifier.isBlank()) {
            throw new AuthException(AuthErrorCode.INVALID_CREDENTIAL);
        }
    }
}
