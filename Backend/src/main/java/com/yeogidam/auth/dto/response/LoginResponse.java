package com.yeogidam.auth.dto.response;

import com.yeogidam.member.domain.Member;
import com.yeogidam.member.dto.response.MemberResponse;
import java.time.Instant;

public record LoginResponse(

        String accessToken,

        String refreshToken,

        String tokenType,

        Instant expiresAt,

        Instant refreshTokenExpiresAt,

        MemberResponse member
) {

    public static LoginResponse from(Member member, TokenResponse tokens) {
        return new LoginResponse(tokens.accessToken(), tokens.refreshToken(), tokens.tokenType(), tokens.expiresAt(),
                tokens.refreshTokenExpiresAt(), MemberResponse.from(member));
    }
}
