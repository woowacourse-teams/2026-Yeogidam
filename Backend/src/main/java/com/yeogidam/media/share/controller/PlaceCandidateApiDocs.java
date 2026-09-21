package com.yeogidam.media.share.controller;

import com.yeogidam.global.dto.ErrorResponse;
import com.yeogidam.media.share.dto.response.SharedMediaWithPlaceCandidatesResponses;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

@Tag(name = "PlaceCandidate", description = "대기함 API")
public interface PlaceCandidateApiDocs {

    @Operation(summary = "대기함 목록 조회",
            description = """
                    로그인한 회원의 대기함에 있는 공유 미디어와 장소 후보를 최근 공유 순서로 돌려줍니다.
                    
                    - `UNDECIDED` 상태인 장소 후보가 하나 이상 있는 공유만 반환합니다.
                    - 장소 후보는 `place_candidates.id` 오름차순으로 반환합니다.
                    - 장소 주소는 `landLotAddress`와 `roadAddress`로 제공합니다.
                    - 대기 중인 장소가 없으면 빈 `sharedMedias` 배열을 반환합니다.
                    """,
            security = @SecurityRequirement(name = "access-token"),
            responses = {
                    @ApiResponse(responseCode = "200", description = "대기함 목록. 대기 중인 공유가 없으면 빈 배열",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = SharedMediaWithPlaceCandidatesResponses.class))),
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
    ResponseEntity<SharedMediaWithPlaceCandidatesResponses> readPlaceCandidates(Long memberId);
}
