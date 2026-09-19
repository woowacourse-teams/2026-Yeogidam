package com.yeogidam.place.controller;

import com.yeogidam.global.dto.ErrorResponse;
import com.yeogidam.place.dto.response.SavedPlaceResponses;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

/**
 * SavedPlaceController의 Swagger 문서. 문서 어노테이션만 두고, 요청 매핑과 인증 파라미터는 구현체가 맡는다.
 * description은 Markdown으로 그려지므로 줄을 가르려면 빈 줄이나 목록 문법을 쓴다.
 */
@Tag(name = "SavedPlace", description = "보관함 API")
public interface SavedPlaceApiDocs {

    @Operation(summary = "보관함 목록 조회",
            description = """
                    로그인한 회원이 보관함에 저장한 장소를 최근 저장 순으로 돌려줍니다.

                    - 보관함 화면, 지도 핀, 보관함 검색이 같은 응답을 씁니다.
                    - 정렬은 `lastSavedAt` 내림차순입니다.
                    - `summaryAddress`는 지번 주소의 도/시와 시/군/구까지입니다. 예) 서울 성동구
                    - `thumbnailSource`가 GOOGLE이면 `thumbnailAttribution`을 화면에 표시해야 합니다.
                    """,
            security = @SecurityRequirement(name = "access-token"),
            responses = {
                    @ApiResponse(responseCode = "200", description = "보관함 목록. 저장한 장소가 없으면 빈 배열",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = SavedPlaceResponses.class))),
                    @ApiResponse(responseCode = "401", description = "토큰 없음 또는 유효하지 않음",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = ErrorResponse.class),
                                    examples = {
                                            @ExampleObject(name = "AUTH401_004", description = "Authorization 헤더가 없거나 Bearer 형식이 아닐 때",
                                                    value = """
                                                    {"message": "로그인이 필요한 요청입니다.", "errorCode": "AUTH401_004"}
                                                    """),
                                            @ExampleObject(name = "AUTH401_001", description = "토큰이 깨졌거나 만료됐거나 액세스 토큰이 아닐 때",
                                                    value = """
                                                    {"message": "인증 토큰이 유효하지 않습니다.", "errorCode": "AUTH401_001"}
                                                    """)
                                    }))
            })
    ResponseEntity<SavedPlaceResponses> readSavedPlaces(Long memberId);
}
