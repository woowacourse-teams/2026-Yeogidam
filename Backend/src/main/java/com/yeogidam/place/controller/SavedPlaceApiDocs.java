package com.yeogidam.place.controller;

import com.yeogidam.global.dto.ErrorResponse;
import com.yeogidam.place.dto.response.SavedPlaceMediaResponses;
import com.yeogidam.place.dto.response.SavedPlaceResponses;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import java.util.Optional;
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
                    - 삭제와 관련 릴스 조회는 이 응답의 `savedPlaceId`(보관함 항목 id)를 경로 변수로 씁니다.
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

    @Operation(summary = "장소 관련 릴스 조회",
            description = """
                    그 장소를 저장하게 만든 릴스 목록입니다. 장소 상세의 게시물 탭과 지도 바텀시트의 이미지 띠에서 씁니다.

                    - 정렬은 `createdAt` 내림차순입니다.
                    - 같은 릴스를 여러 번 공유해 여러 번 저장했으면 최신 공유 한 건만 냅니다.
                    - 릴스 한 건의 필드 이름은 히스토리 목록과 같습니다.
                    - `thumbnailUrl`은 게시물 썸네일이 없으면 null입니다.
                    """,
            security = @SecurityRequirement(name = "access-token"),
            responses = {
                    @ApiResponse(responseCode = "200", description = "관련 릴스 목록",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = SavedPlaceMediaResponses.class),
                                    examples = @ExampleObject(name = "성수 카페 릴스", value = """
                                            {
                                              "media": [
                                                {
                                                  "sharedMediaId": 102,
                                                  "thumbnailUrl": "https://img.example.com/reel10.jpg",
                                                  "author": "@seongsu_life",
                                                  "caption": "성수 카페 투어",
                                                  "sharedUrl": "https://www.instagram.com/reel/C1seongsu/",
                                                  "createdAt": "2026-09-12T10:00:00Z"
                                                }
                                              ]
                                            }
                                            """))),
                    @ApiResponse(responseCode = "404", description = "내가 저장하지 않은 장소",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = ErrorResponse.class),
                                    examples = @ExampleObject(name = "PLACE404_001", description = "없는 장소, 저장하지 않은 장소, 남이 저장한 장소 모두",
                                            value = """
                                            {"message": "저장된 장소가 아닙니다.", "errorCode": "PLACE404_001"}
                                            """))),
                    @ApiResponse(responseCode = "401", description = "토큰 없음 또는 유효하지 않음",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = ErrorResponse.class)))
            })
    ResponseEntity<SavedPlaceMediaResponses> readSavedPlaceMedia(Long memberId,
                                                                  @Parameter(description = "보관함 항목 id(saved_places.id)", example = "11")
                                                                  Long savedPlaceId);

    @Operation(summary = "보관함 장소 삭제",
            description = """
                    고른 보관함 항목을 한 번에 뺍니다. 보관함 편집(여러 개 선택)과 장소 상세 더보기(한 개)에서 씁니다.

                    - 보관함 행과 어느 공유에서 저장했는지 연결만 지웁니다. 후보, 공유 이력, 장소는 남습니다.
                    - 한 트랜잭션이라 일부만 지워지는 일이 없습니다.
                    - 멱등합니다. 이미 지웠거나 남의 항목이 섞여 있어도 "그 항목이 내 보관함에 없다"는 결과가 같아 204입니다.
                    """,
            security = @SecurityRequirement(name = "access-token"),
            responses = {
                    @ApiResponse(responseCode = "204", description = "삭제 완료"),
                    @ApiResponse(responseCode = "400", description = "savedPlaceIds가 없거나 비어 있음",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = ErrorResponse.class),
                                    examples = @ExampleObject(name = "PLACE400_001",
                                            value = """
                                            {"message": "삭제할 보관함 항목이 없습니다.", "errorCode": "PLACE400_001"}
                                            """))),
                    @ApiResponse(responseCode = "401", description = "토큰 없음 또는 유효하지 않음",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = ErrorResponse.class)))
            })
    ResponseEntity<Void> deleteSavedPlaces(Long memberId,
                                           @Parameter(description = "보관함 항목 id(saved_places.id) 목록", example = "11,12")
                                           Optional<List<Long>> savedPlaceIds);
}
