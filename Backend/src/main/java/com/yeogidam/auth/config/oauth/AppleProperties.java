package com.yeogidam.auth.config.oauth;

import com.yeogidam.auth.exception.AuthErrorCode;
import com.yeogidam.auth.exception.AuthException;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;

@ConfigurationProperties("oauth.providers.apple")
public record AppleProperties(
        String clientId,
        String teamId,
        String keyId,
        String privateKey
) {
    public void validateConfiguration() {
        if (clientId == null || clientId.isBlank() || teamId == null || teamId.isBlank()
                || keyId == null || keyId.isBlank() || privateKey == null || privateKey.isBlank()) {
            throw new AuthException(AuthErrorCode.PROVIDER_NOT_CONFIGURED);
        }
    }

    public MultiValueMap<String, String> createTokenRequestBody(String authorizationCode, String clientSecret) {
        MultiValueMap<String, String> body = new LinkedMultiValueMap<>();

        body.add("grant_type", "authorization_code");
        body.add("client_id", clientId);
        body.add("client_secret", clientSecret);
        body.add("code", authorizationCode);
        return body;
    }

    public MultiValueMap<String, String> createRevokeRequestBody(String refreshToken, String clientSecret) {
        MultiValueMap<String, String> body = new LinkedMultiValueMap<>();
        body.add("client_id", clientId);
        body.add("client_secret", clientSecret);
        body.add("token", refreshToken);
        body.add("token_type_hint", "refresh_token");
        return body;
    }
}
