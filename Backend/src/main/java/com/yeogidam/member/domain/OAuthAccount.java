package com.yeogidam.member.domain;

/**
 * 회원의 OAuth 계정 정체성. 제공자와 제공자 쪽 사용자 식별자의 쌍이다.
 * temp-luckyy(러키 도메인 모델링)에서 가져왔다. 진짜 로그인은 추후이며 지금은 정체성 보관만 한다.
 */
public record OAuthAccount(
        OAuthProvider provider,
        String providerUserId
) {

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
    }
}
