package com.yeogidam.auth.dto.response;

import com.yeogidam.auth.domain.token.Token;
import java.time.Instant;

public record TokenResponse(

        String accessToken,

        String refreshToken,

        String tokenType,

        Instant expiresAt,

        Instant refreshTokenExpiresAt
) {
    public TokenResponse(Token accessToken, Token refreshToken) {
        this(accessToken.value(), refreshToken.value(), "Bearer",
                accessToken.expiresAt(), refreshToken.expiresAt());
    }
}
