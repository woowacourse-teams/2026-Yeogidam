package com.yeogidam.auth.service;

import com.yeogidam.auth.domain.oauth.OAuthClient;
import com.yeogidam.auth.domain.oauth.OAuthClients;
import com.yeogidam.auth.domain.oauth.OAuthIdentity;
import com.yeogidam.auth.dto.request.LoginRequest;
import com.yeogidam.auth.dto.request.RefreshTokenRequest;
import com.yeogidam.auth.dto.response.LoginResponse;
import com.yeogidam.auth.dto.response.TokenResponse;
import com.yeogidam.auth.exception.AuthErrorCode;
import com.yeogidam.auth.exception.AuthException;
import com.yeogidam.auth.exception.RefreshTokenMismatchException;
import com.yeogidam.member.domain.Member;
import com.yeogidam.member.domain.OAuthProvider;
import com.yeogidam.member.service.MemberAuthenticator;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AuthService {

    private final OAuthClients clients;
    private final MemberAuthenticator memberAuthenticator;
    private final TokenManager tokenManager;

    @Transactional
    public LoginResponse createLogin(OAuthProvider provider, LoginRequest request) {
        OAuthIdentity identity = readIdentity(provider, request);
        Member member = memberAuthenticator.authenticate(identity.getAccount(), identity.getProfile());
        TokenResponse tokens = tokenManager.createTokens(member.id());
        return LoginResponse.from(member, tokens);
    }

    private OAuthIdentity readIdentity(OAuthProvider provider, LoginRequest request) {
        OAuthClient client = clients.get(provider);
        try {
            return client.readIdentity(request.authorizationCode());
        } catch (IllegalArgumentException exception) {
            throw new AuthException(AuthErrorCode.INVALID_PROVIDER_RESPONSE);
        }
    }

    @Transactional(noRollbackFor = RefreshTokenMismatchException.class)
    public TokenResponse reissueTokens(RefreshTokenRequest request) {
        return tokenManager.createTokenRefresh(request);
    }

    @Transactional
    public void createLogout(RefreshTokenRequest request) {
        tokenManager.revokeRefreshSession(request);
    }
}
