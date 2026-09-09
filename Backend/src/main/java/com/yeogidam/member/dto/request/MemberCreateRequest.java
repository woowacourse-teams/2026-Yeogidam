package com.yeogidam.member.dto.request;

import com.yeogidam.member.domain.OAuthProvider;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record MemberCreateRequest(
        @NotBlank
        String nickname,
        @NotNull
        OAuthProvider provider,
        @NotBlank
        String providerUserId
) {
}
