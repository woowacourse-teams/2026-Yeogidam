package com.yeogidam.auth.infrastructure.oauth.apple;

import com.yeogidam.auth.config.oauth.AppleProperties;
import com.yeogidam.auth.domain.oauth.OAuthClient;
import com.yeogidam.auth.domain.oauth.OAuthIdentity;
import com.yeogidam.auth.dto.response.OAuthTokenResponse;
import com.yeogidam.auth.exception.AuthErrorCode;
import com.yeogidam.auth.exception.AuthException;
import com.yeogidam.auth.infrastructure.oauth.apple.AppleClientSecretGenerator;
import com.yeogidam.auth.infrastructure.oauth.apple.AppleIdentityTokenVerifier;
import com.yeogidam.auth.infrastructure.oauth.OAuthClientErrorHandler;
import com.yeogidam.member.domain.OAuthProvider;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

@Component
@RequiredArgsConstructor
@EnableConfigurationProperties(AppleProperties.class)
public class AppleClient implements OAuthClient {

    private static final String TOKEN_URI = "https://appleid.apple.com/auth/token";
    private static final String REVOKE_URI = "https://appleid.apple.com/auth/revoke";

    private final RestClient restClient;
    private final AppleProperties properties;
    private final AppleIdentityTokenVerifier tokenVerifier;
    private final AppleClientSecretGenerator clientSecretGenerator;
    private final OAuthClientErrorHandler errorHandler;

    @Override
    public OAuthProvider getProvider() {
        return OAuthProvider.APPLE;
    }

    @Override
    public OAuthIdentity readIdentity(String authorizationCode) {
        OAuthTokenResponse token = requestToken(authorizationCode);
        Jwt identity = tokenVerifier.verify(token.idToken());
        String email = null;
        Object emailVerified = identity.getClaims()
                .get("email_verified");
        if (Boolean.TRUE.equals(emailVerified) || "true".equals(emailVerified)) {
            email = identity.getClaimAsString("email");
        }
        return new OAuthIdentity(getProvider(), identity.getSubject(), null, email, null);
    }

    public OAuthTokenResponse requestToken(String authorizationCode) {
        String clientSecret = clientSecretGenerator.generate();
        try {
            OAuthTokenResponse response = restClient.post()
                    .uri(TOKEN_URI)
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(properties.createTokenRequestBody(authorizationCode, clientSecret))
                    .retrieve()
                    .onStatus(HttpStatusCode::isError,
                            (request, providerResponse) -> errorHandler.handle(getProvider(), providerResponse))
                    .body(OAuthTokenResponse.class);
            if (response == null || response.idToken() == null || response.idToken().isBlank()) {
                throw new AuthException(AuthErrorCode.INVALID_PROVIDER_RESPONSE);
            }
            return response;
        } catch (RestClientException exception) {
            throw errorHandler.handle(getProvider(), exception);
        }
    }

    public void revokeToken(String refreshToken) {
        String clientSecret = clientSecretGenerator.generate();
        try {
            restClient.post()
                    .uri(REVOKE_URI)
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(properties.createRevokeRequestBody(refreshToken, clientSecret))
                    .retrieve()
                    .onStatus(HttpStatusCode::isError,
                            (request, providerResponse) -> errorHandler.handle(getProvider(), providerResponse))
                    .toBodilessEntity();
        } catch (RestClientException exception) {
            throw errorHandler.handle(getProvider(), exception);
        }
    }
}
