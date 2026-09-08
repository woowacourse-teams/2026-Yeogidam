package com.yeogidam.media.dto.request;

import jakarta.validation.constraints.NotBlank;

public record InstagramMediaCreateRequest(
        @NotBlank
        String instagramUrl
) {
}
