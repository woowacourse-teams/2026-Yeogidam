package com.yeogidam.auth.infrastructure.oauth.kakao;

import com.yeogidam.auth.config.oauth.KakaoProperties;
import com.yeogidam.auth.domain.oauth.OAuthClient;
import com.yeogidam.auth.domain.oauth.OAuthIdentity;
import com.yeogidam.auth.dto.response.KakaoUserResponse;
import com.yeogidam.auth.dto.response.OAuthTokenResponse;
import com.yeogidam.auth.exception.AuthErrorCode;
import com.yeogidam.auth.exception.AuthException;
import com.yeogidam.auth.infrastructure.oauth.OAuthClientErrorHandler;
import com.yeogidam.member.domain.OAuthProvider;
import com.yeogidam.member.domain.OAuthAccount;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

@Component
@RequiredArgsConstructor
@EnableConfigurationProperties(KakaoProperties.class)
public class KakaoClient implements OAuthClient {

    private static final String TOKEN_URI = "https://kauth.kakao.com/oauth/token";
    private static final String USER_INFO_URI = "https://kapi.kakao.com/v2/user/me";
    private static final String UNLINK_URI = "https://kapi.kakao.com/v1/user/unlink";

    private final RestClient restClient;
    private final KakaoProperties properties;
    private final OAuthClientErrorHandler errorHandler;

    @Override
    public OAuthProvider getProvider() {
        return OAuthProvider.KAKAO;
    }

    @Override
    public OAuthIdentity readIdentity(String authorizationCode) {
        OAuthTokenResponse token = requestToken(authorizationCode);
        KakaoUserResponse user = requestUserInfo(token);
        if (user.id() == null || user.id() <= 0) {
            throw new AuthException(AuthErrorCode.INVALID_CREDENTIAL);
        }
        return createIdentity(user);
    }

    @Override
    public void deleteAccount(String authorizationCode, OAuthAccount expectedAccount) {
        OAuthTokenResponse token = requestToken(authorizationCode);
        OAuthIdentity identity = createIdentity(requestUserInfo(token));
        if (!expectedAccount.equals(identity.getAccount())) {
            throw new AuthException(AuthErrorCode.INVALID_CREDENTIAL);
        }
        unlink(token.accessToken());
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

    private OAuthIdentity createIdentity(KakaoUserResponse user) {
        KakaoUserResponse.Account account = user.account();
        if (account == null) {
            return new OAuthIdentity(getProvider(), user.id().toString(), null, null, null);
        }
        KakaoUserResponse.Profile profile = account.profile();
        String nickname = null;
        String imageUrl = null;
        if (profile != null) {
            nickname = profile.nickname();
            imageUrl = profile.imageUrl();
        }
        return new OAuthIdentity(
                getProvider(),
                user.id().toString(),
                nickname,
                readVerifiedEmail(account),
                imageUrl
        );
    }

    private String readVerifiedEmail(KakaoUserResponse.Account account) {
        if (Boolean.TRUE.equals(account.emailValid()) && Boolean.TRUE.equals(account.emailVerified())) {
            return account.email();
        }
        return null;
    }

    private KakaoUserResponse requestUserInfo(OAuthTokenResponse token) {
        try {
            KakaoUserResponse response = restClient.get()
                    .uri(USER_INFO_URI)
                    .headers(headers -> headers.setBearerAuth(token.accessToken()))
                    .retrieve()
                    .onStatus(HttpStatusCode::isError,
                            (request, providerResponse) -> errorHandler.handle(getProvider(), providerResponse))
                    .body(KakaoUserResponse.class);
            if (response == null) {
                throw new AuthException(AuthErrorCode.INVALID_PROVIDER_RESPONSE);
            }
            return response;
        } catch (RestClientException exception) {
            throw errorHandler.handle(getProvider(), exception);
        }
    }

    private void unlink(String accessToken) {
        try {
            restClient.post()
                    .uri(UNLINK_URI)
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .headers(headers -> headers.setBearerAuth(accessToken))
                    .retrieve()
                    .onStatus(HttpStatusCode::isError,
                            (request, providerResponse) -> errorHandler.handle(getProvider(), providerResponse))
                    .toBodilessEntity();
        } catch (RestClientException exception) {
            throw errorHandler.handle(getProvider(), exception);
        }
    }
}
