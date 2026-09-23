package com.yeogidam.media.share.controller;

import com.yeogidam.global.dto.ErrorResponse;
import com.yeogidam.media.share.dto.response.PlaceCandidateResponses;
import com.yeogidam.media.share.dto.response.ShareHistoryItemResponse;
import com.yeogidam.media.share.dto.response.ShareHistoryResponses;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

@Tag(name = "Share", description = "히스토리 목록과 항목 조회 API")
public interface ShareApiDocs {

    @Operation(summary = "히스토리 목록 조회",
            description = """
                    로그인한 회원의 공유 이력을 최근 공유 순서로 돌려줍니다.

                    - `createdAt` 내림차순으로 정렬하고, 같은 시각에는 `sharedMediaId` 내림차순으로 정렬합니다.
                    - 장소 목록은 포함하지 않으며, 분석 실패 시 `failureReason`을 반환합니다.
                    - 게시글에 접근하지 못한 기록은 `thumbnailUrl`, `caption`, `author`가 null일 수 있습니다.
                    - `sharedUrl`은 게시글 접근 성공 여부와 관계없이 반환합니다.
                    - 공유 이력이 없으면 빈 `sharedMedias` 배열을 반환합니다.
                    """,
            security = @SecurityRequirement(name = "access-token"),
            responses = {
                    @ApiResponse(responseCode = "200", description = "히스토리 목록 조회 성공. 기록이 없으면 빈 배열",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = ShareHistoryResponses.class))),
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
    ResponseEntity<ShareHistoryResponses> readShareHistory(Long memberId);

    @Operation(summary = "히스토리 내 장소 목록 조회",
            description = """
                    로그인한 회원의 히스토리에서 선택한 항목의 장소 목록만 반환합니다.

                    - 장소는 후보 식별자 오름차순으로 반환합니다.
                    - 장소마다 `landLotAddress`와 `roadAddress`를 모두 제공합니다.
                    - 다른 회원의 공유이거나 존재하지 않는 공유면 조회할 수 없습니다.
                    """,
            security = @SecurityRequirement(name = "access-token"),
            responses = {
                    @ApiResponse(responseCode = "200", description = "히스토리 내 장소 목록 조회 성공. 장소가 없으면 빈 배열",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = PlaceCandidateResponses.class))),
                    @ApiResponse(responseCode = "401", description = "토큰 없음 또는 유효하지 않음",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = ErrorResponse.class))),
                    @ApiResponse(responseCode = "404", description = "존재하지 않는 히스토리이거나 다른 회원의 히스토리",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = ErrorResponse.class),
                                    examples = @ExampleObject(value = """
                                            {"message": "존재하지 않는 공유입니다.", "errorCode": "SHARE404_001"}
                                            """)))
            })
    ResponseEntity<PlaceCandidateResponses> readShareHistoryPlaces(Long memberId, Long sharedMediaId);

    @Operation(summary = "히스토리 항목 조회",
            description = """
                    로그인한 회원의 히스토리에서 선택한 공유 항목을 돌려줍니다.

                    - 다른 회원의 공유 결과는 조회할 수 없습니다.
                    - 게시글에 접근하지 못한 결과는 `thumbnailUrl`, `caption`, `author`가 null일 수 있습니다.
                    - `sharedUrl`은 게시글 접근 성공 여부와 관계없이 반환합니다.
                    - 분석 실패 시 `failureReason`을 반환합니다.
                    """,
            security = @SecurityRequirement(name = "access-token"),
            responses = {
                    @ApiResponse(responseCode = "200", description = "히스토리 항목 조회 성공",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = ShareHistoryItemResponse.class))),
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
                                    })),
                    @ApiResponse(responseCode = "404", description = "존재하지 않는 공유이거나 다른 회원의 공유",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = ErrorResponse.class),
                                    examples = @ExampleObject(value = """
                                            {"message": "존재하지 않는 공유입니다.", "errorCode": "SHARE404_001"}
                                            """)))
            })
    ResponseEntity<ShareHistoryItemResponse> readShareHistoryItem(Long memberId, Long sharedMediaId);
}
