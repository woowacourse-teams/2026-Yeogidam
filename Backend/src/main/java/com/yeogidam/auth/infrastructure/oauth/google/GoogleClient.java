package com.yeogidam.auth.infrastructure.oauth.google;

import com.yeogidam.auth.config.oauth.GoogleProperties;
import com.yeogidam.auth.domain.oauth.OAuthClient;
import com.yeogidam.auth.domain.oauth.OAuthIdentity;
import com.yeogidam.auth.dto.response.GoogleUserResponse;
import com.yeogidam.auth.dto.response.OAuthTokenResponse;
import com.yeogidam.auth.exception.AuthErrorCode;
import com.yeogidam.auth.exception.AuthException;
import com.yeogidam.auth.infrastructure.oauth.OAuthClientErrorHandler;
import com.yeogidam.member.domain.OAuthAccount;
import com.yeogidam.member.domain.OAuthProvider;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

@Component
@RequiredArgsConstructor
@EnableConfigurationProperties(GoogleProperties.class)
public class GoogleClient implements OAuthClient {

    private static final String TOKEN_URI = "https://oauth2.googleapis.com/token";
    private static final String USER_INFO_URI = "https://openidconnect.googleapis.com/v1/userinfo";
    private static final String REVOKE_URI = "https://oauth2.googleapis.com/revoke";

    private final RestClient restClient;
    private final GoogleProperties properties;
    private final OAuthClientErrorHandler errorHandler;

    @Override
    public OAuthProvider getProvider() {
        return OAuthProvider.GOOGLE;
    }

    @Override
    public OAuthIdentity readIdentity(String authorizationCode) {
        OAuthTokenResponse token = requestToken(authorizationCode);
        return createIdentity(requestUserInfo(token));
    }

    @Override
    public void deleteAccount(String authorizationCode, OAuthAccount expectedAccount) {
        OAuthTokenResponse token = requestToken(authorizationCode);
        OAuthIdentity identity = createIdentity(requestUserInfo(token));
        if (!expectedAccount.equals(identity.getAccount())) {
            throw new AuthException(AuthErrorCode.INVALID_CREDENTIAL);
        }
        String tokenToRevoke = token.refreshToken();
        if (tokenToRevoke == null || tokenToRevoke.isBlank()) {
            tokenToRevoke = token.accessToken();
        }
        revokeToken(tokenToRevoke);
    }

    private OAuthTokenResponse requestToken(String authorizationCode) {
        try {
            OAuthTokenResponse response = restClient.post()
                    .uri(TOKEN_URI)
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(properties.createTokenRequestBody(authorizationCode))
                    .retrieve()
                    .onStatus(HttpStatusCode::isError,
                            (request, providerResponse) -> errorHandler.handle(getProvider(), providerResponse))
                    .body(OAuthTokenResponse.class);
            if (response == null || response.accessToken() == null || response.accessToken().isBlank()) {
                throw new AuthException(AuthErrorCode.INVALID_PROVIDER_RESPONSE);
            }
            return response;
        } catch (RestClientException exception) {
            throw errorHandler.handle(getProvider(), exception);
        }
    }

    private OAuthIdentity createIdentity(GoogleUserResponse user) {
        return new OAuthIdentity(getProvider(), user.sub(), user.name(), readVerifiedEmail(user), user.picture());
    }

    private String readVerifiedEmail(GoogleUserResponse user) {
        if (Boolean.TRUE.equals(user.emailVerified())) {
            return user.email();
        }
        return null;
    }

    private GoogleUserResponse requestUserInfo(OAuthTokenResponse token) {
        try {
            GoogleUserResponse response = restClient.get()
                    .uri(USER_INFO_URI)
                    .headers(headers -> headers.setBearerAuth(token.accessToken()))
                    .retrieve()
                    .onStatus(HttpStatusCode::isError,
                            (request, providerResponse) -> errorHandler.handle(getProvider(), providerResponse))
                    .body(GoogleUserResponse.class);
            if (response == null) {
                throw new AuthException(AuthErrorCode.INVALID_PROVIDER_RESPONSE);
            }
            return response;
        } catch (RestClientException exception) {
            throw errorHandler.handle(getProvider(), exception);
        }
    }

    private void revokeToken(String token) {
        MultiValueMap<String, String> body = new LinkedMultiValueMap<>();
        body.add("token", token);
        try {
            restClient.post()
                    .uri(REVOKE_URI)
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(body)
                    .retrieve()
                    .onStatus(HttpStatusCode::isError,
                            (request, providerResponse) -> errorHandler.handle(getProvider(), providerResponse))
                    .toBodilessEntity();
        } catch (RestClientException exception) {
            throw errorHandler.handle(getProvider(), exception);
        }
    }
}
