package com.yeogidam.auth.config.oauth;

import com.yeogidam.auth.exception.AuthErrorCode;
import com.yeogidam.auth.exception.AuthException;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.util.UriComponentsBuilder;

@ConfigurationProperties("oauth.providers.kakao")
public record KakaoProperties(
        String clientId,
        String clientSecret,
        String redirectUri
) {

    private static final String AUTHORIZATION_URI = "https://kauth.kakao.com/oauth/authorize";

    public void validateConfiguration() {
        if (clientId == null || clientId.isBlank() || clientSecret == null || clientSecret.isBlank()
                || redirectUri == null || redirectUri.isBlank()) {
            throw new AuthException(AuthErrorCode.PROVIDER_NOT_CONFIGURED);
        }
    }

    public String createAuthorizationUrl(String state) {
        validateConfiguration();
        return UriComponentsBuilder.fromUriString(AUTHORIZATION_URI)
                .queryParam("client_id", clientId)
                .queryParam("redirect_uri", redirectUri)
                .queryParam("response_type", "code")
                .queryParam("state", state)
                .build()
                .encode()
                .toUriString();
    }

    public MultiValueMap<String, String> createTokenRequestBody(String authorizationCode) {
        validateConfiguration();
        MultiValueMap<String, String> body = new LinkedMultiValueMap<>();

        body.add("grant_type", "authorization_code");
        body.add("client_id", clientId);
        body.add("client_secret", clientSecret);
        body.add("redirect_uri", redirectUri);
        body.add("code", authorizationCode);
        return body;
    }
}
