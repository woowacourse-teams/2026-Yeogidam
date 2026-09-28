package com.yeogidam.media.share.dto.request;

import jakarta.validation.constraints.NotBlank;

public record ShareRequest(
        @NotBlank
        String instagramUrl
) {
}
