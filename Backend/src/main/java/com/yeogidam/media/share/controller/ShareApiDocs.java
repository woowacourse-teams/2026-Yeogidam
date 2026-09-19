package com.yeogidam.media.share.controller;

import com.yeogidam.global.dto.ErrorResponse;
import com.yeogidam.media.share.dto.response.ShareResultResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

@Tag(name = "Share", description = "공유 결과 API")
public interface ShareApiDocs {

    @Operation(summary = "공유 결과 조회",
            description = "로그인한 회원의 공유 결과와 분석된 장소 정보를 돌려줍니다. 다른 회원의 공유 결과는 조회할 수 없습니다.",
            security = @SecurityRequirement(name = "access-token"),
            responses = {
                    @ApiResponse(responseCode = "200", description = "공유 결과 조회 성공",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = ShareResultResponse.class))),
                    @ApiResponse(responseCode = "401", description = "토큰 없음 또는 유효하지 않음",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = ErrorResponse.class))),
                    @ApiResponse(responseCode = "404", description = "존재하지 않는 공유이거나 다른 회원의 공유",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = ErrorResponse.class)))
            })
    ResponseEntity<ShareResultResponse> readShareResult(Long memberId, Long sharedMediaId);
}
