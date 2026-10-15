package com.yeogidam.auth.dto.response;

import com.yeogidam.member.domain.MemberAuthentication;
import com.yeogidam.member.dto.response.MemberResponse;
import java.time.Instant;

public record LoginResponse(

        String accessToken,

        String refreshToken,

        String tokenType,

        Instant expiresAt,

        Instant refreshTokenExpiresAt,

        MemberResponse member,

        boolean isNewMember
) {

    public static LoginResponse from(MemberAuthentication authentication, TokenResponse tokens) {
        return new LoginResponse(tokens.accessToken(), tokens.refreshToken(), tokens.tokenType(), tokens.expiresAt(),
                tokens.refreshTokenExpiresAt(), MemberResponse.from(authentication.member()),
                authentication.isNewMember());
    }
}
