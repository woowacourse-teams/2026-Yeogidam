package com.yeogidam.media.share.dto.request;

import jakarta.validation.constraints.NotNull;
import java.util.List;

public record OnboardingShareRequest(
        @NotNull
        List<String> kakaoPlaceIds
) {
}
