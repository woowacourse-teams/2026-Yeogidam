package com.yeogidam.member.dto.request;

import jakarta.validation.constraints.NotBlank;

public record DeleteMemberRequest(
        @NotBlank String authorizationCode
) {
}
