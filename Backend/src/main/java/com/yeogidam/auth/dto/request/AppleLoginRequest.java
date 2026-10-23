package com.yeogidam.auth.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record AppleLoginRequest(
        @NotBlank
        String authorizationCode,
        @Size(max = 255)
        String fullName
) {
}
