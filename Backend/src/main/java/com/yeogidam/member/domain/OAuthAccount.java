package com.yeogidam.member.domain;

import java.nio.charset.StandardCharsets;

/**
 * 회원의 OAuth 계정 정체성. 제공자와 제공자 쪽 사용자 식별자의 쌍이다.
 * 이메일의 유무나 변경과 관계없이 같은 소셜 계정의 회원을 식별한다.
 */
public record OAuthAccount(
        OAuthProvider provider,
        String providerUserId
) {

    private static final int MAX_PROVIDER_USER_ID_BYTES = 255;

    public OAuthAccount {
        validateProvider(provider);
        validateProviderUserId(providerUserId);
    }

    private void validateProvider(OAuthProvider provider) {
        if (provider == null) {
            throw new IllegalArgumentException("OAuth 제공자가 필요합니다.");
        }
    }

    private void validateProviderUserId(String providerUserId) {
        if (providerUserId == null || providerUserId.isBlank()) {
            throw new IllegalArgumentException("OAuth 사용자 식별자가 비어 있습니다.");
        }
        if (providerUserId.getBytes(StandardCharsets.UTF_8).length > MAX_PROVIDER_USER_ID_BYTES) {
            throw new IllegalArgumentException("OAuth 사용자 식별자가 너무 깁니다.");
        }
    }
}
