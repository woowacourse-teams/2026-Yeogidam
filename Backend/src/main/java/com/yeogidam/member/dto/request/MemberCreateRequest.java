package com.yeogidam.member.dto.request;

import jakarta.validation.constraints.NotBlank;

public record MemberCreateRequest(
        @NotBlank
        String nickname
) {
}
