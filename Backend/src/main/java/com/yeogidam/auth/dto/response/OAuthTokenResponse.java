package com.yeogidam.auth.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;

public record OAuthTokenResponse(

        @JsonProperty("access_token")
        String accessToken,

        @JsonProperty("refresh_token")
        String refreshToken,

        @JsonProperty("id_token")
        String idToken
) {
}
