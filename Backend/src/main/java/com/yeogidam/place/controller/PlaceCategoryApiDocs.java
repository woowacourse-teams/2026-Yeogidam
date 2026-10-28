package com.yeogidam.place.controller;

import com.yeogidam.place.dto.response.PlaceCategoryResponses;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

@Tag(name = "PlaceCategory", description = "장소 카테고리 칩 API입니다.")
public interface PlaceCategoryApiDocs {

    @Operation(summary = "장소 카테고리 칩 목록 조회",
            description = """
                    보관함과 지도에 표시할 칩 11개를 인증 없이 조회합니다.

                    - 카페, 디저트, 한식, 양식, 일식, 중식, 분식, 술집, 별미, 문화/여가, 기타 순서입니다.
                    - 저장된 장소가 없는 칩도 목록에 포함합니다.
                    - 보관함의 `categoryCode`로 장소를 필터링하고 `categoryName`을 분류칩에 표시합니다.
                    """,
            responses = @ApiResponse(responseCode = "200", description = "칩 코드와 이름을 표시 순서대로 돌려줍니다.",
                    content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                            schema = @Schema(implementation = PlaceCategoryResponses.class))))
    ResponseEntity<PlaceCategoryResponses> readPlaceCategories();
}
