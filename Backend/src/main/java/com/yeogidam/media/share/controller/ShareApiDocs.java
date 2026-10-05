package com.yeogidam.media.share.controller;

import com.yeogidam.global.dto.ErrorResponse;
import com.yeogidam.media.share.dto.request.PlaceDecisionRequest;
import com.yeogidam.media.share.dto.request.ShareRequest;
import com.yeogidam.media.share.dto.response.PlaceCandidateResponses;
import com.yeogidam.media.share.dto.response.ShareHistoryResponses;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.time.Instant;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

/**
 * ShareController의 Swagger 문서. 문서 어노테이션만 두고, 요청 매핑과 인증 파라미터는 구현체가 맡는다.
 */
@Tag(name = "Share", description = "공유 API")
public interface ShareApiDocs {

    @Operation(summary = "인스타그램 미디어 공유",
            description = """
                    미디어를 공유 이력에 등록하고, 처음 보거나 파이프라인 버전이 바뀐 경우 비동기로 분석합니다.
                    """,
            security = @SecurityRequirement(name = "access-token"),
            responses = {
                    @ApiResponse(responseCode = "202", description = "공유 접수 성공"),
                    @ApiResponse(responseCode = "400", description = "요청 필드 또는 인스타그램 링크가 올바르지 않음",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = ErrorResponse.class),
                                    examples = {
                                            @ExampleObject(name = "COMMON400_001",
                                                    description = "instagramUrl이 비어 있을 때",
                                                    value = """
                                                            {"message": "유효하지 않은 요청 필드입니다.", "errorCode": "COMMON400_001"}
                                                            """),
                                            @ExampleObject(name = "MEDIA400_001",
                                                    description = "지원하지 않는 링크일 때",
                                                    value = """
                                                            {"message": "지원하지 않는 링크입니다.", "errorCode": "MEDIA400_001"}
                                                            """),
                                            @ExampleObject(name = "MEDIA400_010",
                                                    description = "올바르지 않은 형식의 인스타그램 링크일 때",
                                                    value = """
                                                            {"message": "올바른 인스타그램 링크 형식이 아닙니다.", "errorCode": "MEDIA400_010"}
                                                            """)
                                    })),
                    @ApiResponse(responseCode = "401", description = "로그인하지 않음",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = ErrorResponse.class),
                                    examples = {
                                            @ExampleObject(name = "AUTH401_004",
                                                    description = "Authorization 헤더가 없거나 Bearer 형식이 아닐 때",
                                                    value = """
                                                            {"message": "로그인이 필요한 요청입니다.", "errorCode": "AUTH401_004"}
                                                            """),
                                            @ExampleObject(name = "AUTH401_001",
                                                    description = "토큰이 깨졌거나 만료됐거나 액세스 토큰이 아닐 때",
                                                    value = """
                                                            {"message": "인증 토큰이 유효하지 않습니다.", "errorCode": "AUTH401_001"}
                                                            """)
                                    }))
            })
    ResponseEntity<Void> createShare(Long memberId, @Valid ShareRequest request);

    @Operation(summary = "대기함 장소 후보 저장 또는 삭제",
            description = """
                    로그인한 회원의 공유 한 건에서 선택한 장소 후보를 보관함에 저장하거나 대기함에서 삭제합니다.

                    - `placeIds`는 이 공유에 발급된 후보의 장소 ID(`places.id`)입니다.
                    - `decision`은 `SAVED` 또는 `DISCARDED`이며 선택한 후보 모두에 동일하게 적용합니다.
                    - `SAVED`는 보관함을 생성하거나 기존 장소의 마지막 저장 시각을 갱신하고 이 공유를 연결합니다.
                    - `DISCARDED`는 후보를 버림 상태로 바꾸며 기존 보관함과 공유 연결을 유지합니다.
                    - 선택하지 않은 후보는 그대로 두고, 미결정 후보가 모두 없어지면 공유가 대기함에서 사라집니다.
                    - 후보 결정과 보관함 저장, 공유 연결은 하나의 트랜잭션으로 처리합니다.
                    """,
            security = @SecurityRequirement(name = "access-token"),
            responses = {
                    @ApiResponse(responseCode = "201", description = "후보 결정 완료. 응답 본문 없음",
                            content = @Content),
                    @ApiResponse(responseCode = "400", description = "요청 필드 오류, 공유의 후보가 아닌 장소 또는 미발급 후보",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = ErrorResponse.class),
                                    examples = {
                                            @ExampleObject(name = "COMMON400_001", description = "장소 목록이나 결정값이 올바르지 않음",
                                                    value = """
                                                            {"message": "유효하지 않은 요청 필드입니다.", "errorCode": "COMMON400_001"}
                                                            """),
                                            @ExampleObject(name = "MEDIA400_004", description = "이 공유의 후보가 아닌 장소가 포함됨",
                                                    value = """
                                                            {"message": "이 공유 건의 후보가 아닌 장소는 결정할 수 없습니다.", "errorCode": "MEDIA400_004"}
                                                            """),
                                            @ExampleObject(name = "MEDIA400_007", description = "공유에 후보가 아직 발급되지 않음",
                                                    value = """
                                                            {"message": "추출이 끝나지 않은 게시물에는 선택할 장소가 없습니다.", "errorCode": "MEDIA400_007"}
                                                            """)
                                    })),
                    @ApiResponse(responseCode = "401", description = "토큰 없음 또는 유효하지 않음",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = ErrorResponse.class),
                                    examples = {
                                            @ExampleObject(name = "AUTH401_004", description = "로그인 정보 없음",
                                                    value = """
                                                            {"message": "로그인이 필요한 요청입니다.", "errorCode": "AUTH401_004"}
                                                            """),
                                            @ExampleObject(name = "AUTH401_001", description = "유효하지 않은 액세스 토큰",
                                                    value = """
                                                            {"message": "인증 토큰이 유효하지 않습니다.", "errorCode": "AUTH401_001"}
                                                            """)
                                    })),
                    @ApiResponse(responseCode = "404", description = "존재하지 않는 공유이거나 다른 회원의 공유",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = ErrorResponse.class),
                                    examples = @ExampleObject(name = "MEDIA404_002",
                                            value = """
                                                    {"message": "존재하지 않는 공유입니다.", "errorCode": "MEDIA404_002"}
                                                    """)))
            })
    ResponseEntity<Void> createPlaceDecisions(
            Long memberId,
            @Parameter(description = "공유 ID(shared_media.id)", example = "101") Long sharedMediaId,
            @Valid PlaceDecisionRequest request
    );

    @Operation(summary = "히스토리 목록 조회",
            description = """
                    로그인한 회원의 공유 이력을 최근 공유부터 50건씩 반환합니다.

                    - `createdAt` 내림차순으로 정렬하고, 같은 시각에는 `sharedMediaId` 내림차순으로 정렬합니다.
                    - 커서 없이 요청하면 가장 최근 50건을 반환합니다. 목록 폴링도 커서 없이 요청해 첫 페이지만 갱신합니다.
                    - 다음 페이지가 있으면 `nextCursor`에 이번 페이지 마지막 공유의 `createdAt`과 `id`가 담기고, 없으면 `nextCursor`는 null입니다.
                    - 다음 페이지는 `nextCursor`의 두 값을 `cursorCreatedAt`, `cursorId`로 보내 요청합니다. 두 값은 함께 보내야 합니다.
                    - `cursorCreatedAt`은 받은 값을 마이크로초까지 그대로 보내야 페이지 경계의 공유가 빠지지 않습니다.
                    - 장소 목록은 포함하지 않으며, 분석 실패 시 `failureReason`을 반환합니다.
                    - `failureReason`은 `CONTENT_UNAVAILABLE`, `PLACE_NOT_EXTRACTED`, `PLACE_NOT_MATCHED`,
                      `PROCESSING_FAILED`, `UNEXPECTED` 중 하나입니다.
                    - 게시글에 접근하지 못한 기록은 `thumbnailUrl`, `caption`, `author`가 null일 수 있습니다.
                    - `sharedUrl`은 게시글 접근 성공 여부와 관계없이 반환합니다.
                    - 공유 이력이 없으면 빈 `sharedMedias` 배열을 반환합니다.
                    """,
            security = @SecurityRequirement(name = "access-token"),
            responses = {
                    @ApiResponse(responseCode = "200", description = "히스토리 목록 조회 성공. 기록이 없으면 빈 배열",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = ShareHistoryResponses.class))),
                    @ApiResponse(responseCode = "400", description = "커서 값이 하나만 오거나 형식이 맞지 않음",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = ErrorResponse.class),
                                    examples = {
                                            @ExampleObject(name = "MEDIA400_015",
                                                    description = "cursorCreatedAt과 cursorId 중 하나만 보냈을 때",
                                                    value = """
                                                            {"message": "커서의 공유 시각과 ID는 함께 보내야 합니다.", "errorCode": "MEDIA400_015"}
                                                            """),
                                            @ExampleObject(name = "COMMON400_004",
                                                    description = "cursorCreatedAt이 ISO-8601 시각이 아니거나 cursorId가 숫자가 아닐 때",
                                                    value = """
                                                            {"message": "요청 값의 형식이 올바르지 않습니다.", "errorCode": "COMMON400_004"}
                                                            """)
                                    })),
                    @ApiResponse(responseCode = "401", description = "토큰 없음 또는 유효하지 않음",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = ErrorResponse.class),
                                    examples = {
                                            @ExampleObject(name = "AUTH401_004",
                                                    description = "Authorization 헤더가 없거나 Bearer 형식이 아닐 때",
                                                    value = """
                                                            {"message": "로그인이 필요한 요청입니다.", "errorCode": "AUTH401_004"}
                                                            """),
                                            @ExampleObject(name = "AUTH401_001",
                                                    description = "토큰이 깨졌거나 만료됐거나 액세스 토큰이 아닐 때",
                                                    value = """
                                                            {"message": "인증 토큰이 유효하지 않습니다.", "errorCode": "AUTH401_001"}
                                                            """)
                                    }))
            })
    ResponseEntity<ShareHistoryResponses> readShareHistory(
            Long memberId,
            @Parameter(description = "다음 페이지를 요청할 때 이전 응답의 nextCursor.createdAt을 보냅니다.",
                    example = "2026-09-20T03:12:45.123456Z") Instant cursorCreatedAt,
            @Parameter(description = "다음 페이지를 요청할 때 이전 응답의 nextCursor.id를 보냅니다.", example = "812") Long cursorId
    );

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
                                    schema = @Schema(implementation = ErrorResponse.class),
                                    examples = {
                                            @ExampleObject(name = "AUTH401_004",
                                                    description = "Authorization 헤더가 없거나 Bearer 형식이 아닐 때",
                                                    value = """
                                                            {"message": "로그인이 필요한 요청입니다.", "errorCode": "AUTH401_004"}
                                                            """),
                                            @ExampleObject(name = "AUTH401_001",
                                                    description = "토큰이 깨졌거나 만료됐거나 액세스 토큰이 아닐 때",
                                                    value = """
                                                            {"message": "인증 토큰이 유효하지 않습니다.", "errorCode": "AUTH401_001"}
                                                            """)
                                    })),
                    @ApiResponse(responseCode = "404", description = "존재하지 않는 공유이거나 다른 회원의 공유",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = ErrorResponse.class),
                                    examples = @ExampleObject(name = "MEDIA404_002",
                                            description = "존재하지 않거나 다른 회원의 공유일 때",
                                            value = """
                                            {"message": "존재하지 않는 공유입니다.", "errorCode": "MEDIA404_002"}
                                            """)))
            })
    ResponseEntity<PlaceCandidateResponses> readShareHistoryPlaces(
            Long memberId,
            @Parameter(description = "공유 이력 id(shared_media.id)", example = "102") Long sharedMediaId
    );
}
