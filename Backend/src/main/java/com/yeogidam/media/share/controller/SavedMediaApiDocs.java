package com.yeogidam.media.share.controller;

import com.yeogidam.global.dto.ErrorResponse;
import com.yeogidam.media.share.dto.response.SavedMediaResponses;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.Instant;
import java.util.List;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

/**
 * SavedMediaController의 Swagger 문서로, 문서 어노테이션만 두고 요청 매핑과 인증 파라미터는 구현체가 맡는다.
 */
@Tag(name = "SavedMedia", description = "보관함 게시물 API입니다.")
public interface SavedMediaApiDocs {

    @Operation(summary = "보관함 게시물 목록 조회",
            description = """
                    로그인한 회원의 보관함 게시물 탭 목록을 최근 공유부터 50건씩 돌려줍니다.

                    - 분석에 성공했고 추출된 장소가 1곳 이상인 내 공유만 돌려주므로, 분석 중이거나 실패한 공유와 장소가 나오지 않은 게시물은 빠집니다.
                    - 분석 결과는 내 공유의 상태로 판단하므로, 내 공유가 실패로 남았으면 다른 회원의 공유로 같은 게시물의 분석이 성공해도 빠집니다.
                    - 보관함 게시물 삭제(`DELETE /api/v1/saved-media`)로 지운 게시글도 빠집니다.
                    - 장소를 보관함에서 모두 저장 해제한 게시물도 목록에 남습니다.
                    - 같은 게시물을 여러 번 공유했으면 지우지 않았고 분석에 성공한 공유 가운데 가장 최근 한 건만 돌려줍니다.
                    - `createdAt` 내림차순으로 정렬하고 같은 시각에는 `sharedMediaId` 내림차순으로 정렬합니다.
                    - 다음 페이지가 있으면 `nextCursor`에 이번 페이지 마지막 게시물의 `createdAt`과 `id`를 담고, 없으면 `nextCursor`를 null로 돌려줍니다.
                    - 다음 페이지는 `nextCursor`의 두 값을 `cursorCreatedAt`, `cursorId`로 보내 요청하며 두 값은 함께 보내야 합니다.
                    - `cursorCreatedAt`은 받은 값을 마이크로초까지 그대로 보내야 페이지 경계의 게시물이 빠지지 않습니다.
                    - `places`에는 게시물에서 추출된 장소를 추출 순서로 담고, 보관함에 없는 장소는 `savedPlaceId`를 null로 돌려줍니다.
                    - `places`의 `latitude`, `longitude`, `kakaoPlaceUrl`, `telephone`은 보관함 장소 목록과 같은 값이라, 저장하지 않은 장소도 장소 상세의 지도 위치, 카카오 링크, 전화번호를 게시물 탭 응답의 값으로 채울 수 있습니다.
                    - `latitude`와 `longitude`는 늘 값이 있고, `kakaoPlaceUrl`과 `telephone`은 장소에 값이 없으면 null을 돌려줍니다.
                    - 카드 제목은 앱이 `caption` 첫 줄을 잘라 만듭니다.
                    - 보관함 게시물이 없으면 빈 `sharedMedia` 배열을 돌려줍니다.
                    """,
            security = @SecurityRequirement(name = "access-token"),
            responses = {
                    @ApiResponse(responseCode = "200", description = "보관함 게시물 목록을 조회했으며 게시물이 없으면 빈 배열을 돌려줍니다.",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = SavedMediaResponses.class))),
                    @ApiResponse(responseCode = "400", description = "커서 값이 하나만 오거나 형식이 맞지 않습니다.",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = ErrorResponse.class),
                                    examples = {
                                            @ExampleObject(name = "MEDIA400_015",
                                                    description = "cursorCreatedAt과 cursorId 중 하나만 보냈을 때 돌려줍니다.",
                                                    value = """
                                                            {"message": "커서의 공유 시각과 ID는 함께 보내야 합니다.", "errorCode": "MEDIA400_015"}
                                                            """),
                                            @ExampleObject(name = "COMMON400_004",
                                                    description = "cursorCreatedAt이 ISO-8601 시각이 아니거나 cursorId가 숫자가 아닐 때 돌려줍니다.",
                                                    value = """
                                                            {"message": "요청 값의 형식이 올바르지 않습니다.", "errorCode": "COMMON400_004"}
                                                            """)
                                    })),
                    @ApiResponse(responseCode = "401", description = "토큰이 없거나 유효하지 않습니다.",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = ErrorResponse.class),
                                    examples = {
                                            @ExampleObject(name = "AUTH401_004",
                                                    description = "Authorization 헤더가 없거나 Bearer 형식이 아닐 때 돌려줍니다.",
                                                    value = """
                                                            {"message": "로그인이 필요한 요청입니다.", "errorCode": "AUTH401_004"}
                                                            """),
                                            @ExampleObject(name = "AUTH401_001",
                                                    description = "토큰이 깨졌거나 만료됐거나 액세스 토큰이 아닐 때 돌려줍니다.",
                                                    value = """
                                                            {"message": "인증 토큰이 유효하지 않습니다.", "errorCode": "AUTH401_001"}
                                                            """)
                                    }))
            })
    ResponseEntity<SavedMediaResponses> readSavedMedia(
            Long memberId,
            @Parameter(description = "다음 페이지를 요청할 때 이전 응답의 nextCursor.createdAt을 보냅니다.",
                    example = "2026-11-04T03:12:45.123456Z") Instant cursorCreatedAt,
            @Parameter(description = "다음 페이지를 요청할 때 이전 응답의 nextCursor.id를 보냅니다.", example = "812") Long cursorId
    );

    @Operation(summary = "보관함 게시물 삭제",
            description = """
                    보관함 게시물 탭의 편집에서 고른 게시글을 한 번에 지웁니다.

                    - 게시글마다 같은 게시물의 내 공유를 모두 지웁니다. 게시물 탭은 게시물마다 최신 공유 한 건만 보여 주므로, 한 건만 지우면 예전 공유가 대신 보이기 때문입니다.
                    - 지운 게시글에만 있는 장소는 폴더에 담겨 있어도 보관함과 지도에서 빠집니다.
                    - 지우지 않은 다른 게시글에서 저장했거나, 분석에 성공한 다른 게시글에서 추출된 장소는 남습니다.
                    - 지운 게시글은 게시물 탭과 장소 상세의 관련 릴스에서 빠지고, 히스토리(`GET /api/v1/shares`)에는 그대로 남습니다.
                    - 한 트랜잭션이라 일부만 지워지는 일이 없습니다.
                    - 이미 지웠거나 남의 게시글이 섞여 있어도 "해당 게시글이 내 보관함에 없다"는 결과가 같아 204를 돌려주므로 멱등합니다.
                    - 지운 게시물을 다시 공유하면 새 게시글로 보관함에 다시 담깁니다. 분석 중인 게시물이면 분석이 끝난 뒤에 담깁니다.
                    """,
            security = @SecurityRequirement(name = "access-token"),
            responses = {
                    @ApiResponse(responseCode = "204", description = "삭제를 완료했습니다."),
                    @ApiResponse(responseCode = "400", description = "sharedMediaIds가 없거나 비어 있거나 형식이 맞지 않습니다.",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = ErrorResponse.class),
                                    examples = {
                                            @ExampleObject(name = "MEDIA400_018",
                                                    description = "sharedMediaIds를 빈 값으로 보냈을 때 돌려줍니다.",
                                                    value = """
                                                            {"message": "삭제할 게시글이 없습니다.", "errorCode": "MEDIA400_018"}
                                                            """),
                                            @ExampleObject(name = "COMMON400_003",
                                                    description = "sharedMediaIds를 보내지 않았을 때 돌려줍니다.",
                                                    value = """
                                                            {"message": "필수 요청 파라미터가 누락되었습니다.", "errorCode": "COMMON400_003"}
                                                            """),
                                            @ExampleObject(name = "COMMON400_004",
                                                    description = "sharedMediaIds에 숫자가 아닌 값이 있을 때 돌려줍니다.",
                                                    value = """
                                                            {"message": "요청 값의 형식이 올바르지 않습니다.", "errorCode": "COMMON400_004"}
                                                            """)
                                    })),
                    @ApiResponse(responseCode = "401", description = "토큰이 없거나 유효하지 않습니다.",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = ErrorResponse.class),
                                    examples = {
                                            @ExampleObject(name = "AUTH401_004",
                                                    description = "Authorization 헤더가 없거나 Bearer 형식이 아닐 때 돌려줍니다.",
                                                    value = """
                                                            {"message": "로그인이 필요한 요청입니다.", "errorCode": "AUTH401_004"}
                                                            """),
                                            @ExampleObject(name = "AUTH401_001",
                                                    description = "토큰이 깨졌거나 만료됐거나 액세스 토큰이 아닐 때 돌려줍니다.",
                                                    value = """
                                                            {"message": "인증 토큰이 유효하지 않습니다.", "errorCode": "AUTH401_001"}
                                                            """)
                                    }))
            })
    ResponseEntity<Void> deleteSavedMedia(
            Long memberId,
            @Parameter(description = "게시물 탭 응답의 sharedMediaId 목록입니다.", example = "812,790") List<Long> sharedMediaIds
    );
}
