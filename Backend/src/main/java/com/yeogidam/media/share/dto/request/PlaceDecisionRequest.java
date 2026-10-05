package com.yeogidam.media.share.dto.request;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import java.util.List;

public record PlaceDecisionRequest(

        @NotEmpty
        @Schema(description = "선택한 장소 ID 목록(places.id)", example = "[11, 13]")
        List<@NotNull @Positive Long> placeIds,

        @NotBlank
        @Pattern(regexp = "SAVED|DISCARDED")
        @Schema(description = "선택한 후보에 적용할 결정", allowableValues = {"SAVED", "DISCARDED"}, example = "SAVED")
        String decision
) {
}
