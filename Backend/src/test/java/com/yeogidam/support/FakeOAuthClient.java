package com.yeogidam.support;

import com.yeogidam.auth.domain.oauth.OAuthClient;
import com.yeogidam.auth.domain.oauth.OAuthIdentity;
import com.yeogidam.auth.exception.AuthErrorCode;
import com.yeogidam.auth.exception.AuthException;
import com.yeogidam.member.domain.OAuthProvider;

/**
 * E2E에서 제공자를 대신하는 클라이언트. 인가 코드를 제공자 사용자 식별자로 그대로 받고,
 * 약속된 코드 두 개로 제공자 거부와 제공자 장애를 흉내 낸다. 실제 제공자 HTTP는 각 클라이언트 단위 테스트가 맡는다.
 */
public final class FakeOAuthClient implements OAuthClient {

    public static final String REJECTED_CODE = "rejected-code";
    public static final String UNAVAILABLE_CODE = "unavailable-code";

    private final OAuthProvider provider;

    public FakeOAuthClient(OAuthProvider provider) {
        this.provider = provider;
    }

    @Override
    public OAuthProvider getProvider() {
        return provider;
    }

    @Override
    public OAuthIdentity readIdentity(String authorizationCode) {
        if (REJECTED_CODE.equals(authorizationCode)) {
            throw new AuthException(AuthErrorCode.INVALID_CREDENTIAL);
        }
        if (UNAVAILABLE_CODE.equals(authorizationCode)) {
            throw new AuthException(AuthErrorCode.PROVIDER_UNAVAILABLE);
        }
        return new OAuthIdentity(provider, authorizationCode, nicknameOf(authorizationCode),
                authorizationCode + "@example.com", null);
    }

    private String nicknameOf(String authorizationCode) {
        return provider.name().toLowerCase() + "-" + authorizationCode;
    }
}
