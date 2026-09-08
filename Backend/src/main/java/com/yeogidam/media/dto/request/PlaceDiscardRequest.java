package com.yeogidam.media.dto.request;

import jakarta.validation.constraints.NotEmpty;
import java.util.List;

public record PlaceDiscardRequest(
        @NotEmpty
        List<Long> placeIds
) {
}
