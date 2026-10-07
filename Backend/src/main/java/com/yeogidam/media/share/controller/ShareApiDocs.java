package com.yeogidam.media.share.controller;

import com.yeogidam.global.dto.ErrorResponse;
import com.yeogidam.media.share.dto.request.ShareRequest;
import com.yeogidam.media.share.dto.response.ExtractionRetryResponse;
import com.yeogidam.media.share.dto.response.ShareHistoryPlaceResponses;
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
                    미디어를 공유 이력에 등록합니다. 분석에 성공하면 검색된 모든 장소를 보관함에 저장하고 이 공유와 연결합니다.
                    처음 보거나 파이프라인 버전이 바뀐 경우에는 비동기로 분석합니다.
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

    @Operation(summary = "실패한 장소 추출 재시도",
            description = """
                    로그인한 회원의 실패한 공유 이력에서 장소 추출을 다시 요청합니다. 요청 본문은 없습니다.

                    - 기존 실패 이력과 최초 공유 시각을 보존합니다.
                    - 현재 분석 버전에서는 `PROCESSING_FAILED`, `UNEXPECTED`만 재시도할 수 있습니다.
                    - 이전 분석 버전의 실패는 실패 사유에 관계없이 재시도할 수 있습니다.
                    - 운영이 씨앗으로 넣은 게시물(`source_type = SEEDED`)은 추출 파이프라인을 타지 않으므로 재시도할 수 없습니다.
                    - 같은 회원이 같은 미디어의 분석 중인 이력을 이미 갖고 있으면 그 이력 ID를 반환합니다.
                    - 요청 회원의 분석 중인 이력이 없으면 새 이력을 만들어 해당 분석에 합류합니다.
                    - 분석 중인 이력을 대상으로 요청할 수 없습니다.
                    - 본인 실패 후 다른 회원이 성공한 미디어를 재시도하면 재공유처럼 새 성공 이력을 만들고 장소를 바로 저장합니다.
                    - 요청 회원의 성공 이력이 이미 있어도 과거 실패 이력의 재시도는 허용합니다.
                    - 결과는 이번 분석을 기다리는 이력에만 반영하며 참여 회원별 최신 이력에 장소를 보관함으로 자동 저장합니다.
                    """,
            security = @SecurityRequirement(name = "access-token"),
            responses = {
                    @ApiResponse(responseCode = "202", description = "새 재시도 이력 접수, 분석 중인 이력 재사용 또는 기존 결과로 즉시 성공",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = ExtractionRetryResponse.class),
                                    examples = {
                                            @ExampleObject(name = "재시도 이력",
                                                    description = "새로 접수하거나 재사용한 이력과 분석 상태",
                                                    value = """
                                                            {
                                                              "sharedMediaId": 30,
                                                              "extractionStatus": "EXTRACTING"
                                                            }
                                                            """),
                                            @ExampleObject(name = "기존 성공 결과 재사용",
                                                    description = "이미 분석에 성공한 미디어의 새 성공 이력",
                                                    value = """
                                                            {
                                                              "sharedMediaId": 30,
                                                              "extractionStatus": "SUCCEEDED"
                                                            }
                                                            """)
                                    })),
                    @ApiResponse(responseCode = "400", description = "성공 또는 분석 중인 이력, 재시도할 수 없는 실패",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = ErrorResponse.class),
                                    examples = {
                                             @ExampleObject(name = "MEDIA400_002",
                                                     description = "성공한 공유 이력 자체를 대상으로 요청할 때",
                                                     value = """
                                                            {"message": "추출에 성공한 게시물은 다시 시도할 수 없습니다.", "errorCode": "MEDIA400_002"}
                                                            """),
                                            @ExampleObject(name = "MEDIA400_006",
                                                    description = "분석 중인 공유 이력을 대상으로 요청할 때",
                                                    value = """
                                                            {"message": "추출이 진행 중인 게시물은 다시 시도할 수 없습니다.", "errorCode": "MEDIA400_006"}
                                                            """),
                                             @ExampleObject(name = "MEDIA400_016",
                                                     description = "현재 분석 버전에서 재시도할 수 없는 실패 사유이거나 씨앗으로 넣은 게시물일 때",
                                                     value = """
                                                             {"message": "현재 분석 버전에서는 재시도가 불가능합니다.", "errorCode": "MEDIA400_016"}
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
                                    })),
                    @ApiResponse(responseCode = "404", description = "존재하지 않거나 다른 회원의 공유",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = ErrorResponse.class),
                                    examples = @ExampleObject(name = "MEDIA404_002",
                                            description = "존재하지 않거나 다른 회원의 공유 이력일 때",
                                            value = """
                                                    {"message": "존재하지 않는 공유입니다.", "errorCode": "MEDIA404_002"}
                                                    """)))
            })
    ResponseEntity<ExtractionRetryResponse> createExtractionRetry(
            Long memberId,
            @Parameter(description = "재시도할 실패 이력 ID(shared_media.id)", example = "10") Long sharedMediaId
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
                    로그인한 회원의 지정된 공유 이력에서 추출된 장소 목록을 반환합니다.

                    - 장소는 릴스 추출 결과 순서로 반환합니다.
                    - 장소마다 `landLotAddress`와 `roadAddress`를 모두 제공합니다.
                    - 다른 회원의 공유이거나 존재하지 않는 공유면 조회할 수 없습니다.
                    """,
            security = @SecurityRequirement(name = "access-token"),
            responses = {
                    @ApiResponse(responseCode = "200", description = "히스토리 내 장소 목록 조회 성공. 장소가 없으면 빈 배열",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = ShareHistoryPlaceResponses.class))),
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
    ResponseEntity<ShareHistoryPlaceResponses> readShareHistoryPlaces(
            Long memberId,
            @Parameter(description = "공유 이력 id(shared_media.id)", example = "102") Long sharedMediaId
    );
}
