package com.yeogidam.user.dto.request;

import jakarta.validation.constraints.NotBlank;

public record UserCreateRequest(
        @NotBlank
        String nickname
) {
}
