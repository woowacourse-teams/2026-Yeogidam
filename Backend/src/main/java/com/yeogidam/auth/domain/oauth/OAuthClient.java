package com.yeogidam.auth.domain.oauth;

import com.yeogidam.member.domain.OAuthProvider;

public interface OAuthClient {

    OAuthProvider getProvider();

    OAuthIdentity readIdentity(String authorizationCode);
}
