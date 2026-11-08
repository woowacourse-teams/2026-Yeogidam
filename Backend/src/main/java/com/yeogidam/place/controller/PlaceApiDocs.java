package com.yeogidam.place.controller;

import com.yeogidam.global.dto.ErrorResponse;
import com.yeogidam.place.dto.response.PlaceInfoResponse;
import com.yeogidam.place.dto.response.PlaceMediaResponses;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

/**
 * PlaceController의 Swagger 문서로, 문서 어노테이션만 두고 요청 매핑과 인증 파라미터는 구현체가 맡는다.
 */
@Tag(name = "Place", description = "장소 API입니다.")
public interface PlaceApiDocs {

    @Operation(summary = "장소 영업시간과 메뉴 조회",
            description = """
                    장소의 요일별 영업시간과 메뉴 전체를 돌려줍니다.
                    영업시간과 메뉴는 회원마다 다르지 않은 장소 정보라서, 보관함에 저장하지 않은 장소도 있는 장소면 조회할 수 있습니다.

                    - `openingHours`는 월요일부터 일요일 순으로 돌려주고, 영업 구간의 시각은 HH:mm입니다.
                    - 확인된 휴무일의 `periods`는 빈 배열이고, 배열에 없는 요일은 정보가 없는 요일입니다.
                    - `closesAt`이 `opensAt`보다 이르면 다음 날 `closesAt`에 닫습니다. 월요일 `18:00`~`02:00`은 화요일 02:00에 닫는 월요일 영업입니다.
                    - `closesAt`에만 `24:00`이 올 수 있고, 24시간 영업은 `00:00`~`24:00`입니다.
                    - 영업시간 정보가 없거나 저장된 형식이 올바르지 않으면 `openingHours`는 `null`입니다.
                    - 메뉴는 저장한 순서로 돌려줍니다. `menus[].price`는 원 단위이며, 가격을 모르면 `null`입니다.
                    - 메뉴 정보가 없거나 저장된 형식이 올바르지 않으면 `menus`는 빈 배열(`[]`)입니다.
                    """,
            security = @SecurityRequirement(name = "access-token"),
            responses = {
                    @ApiResponse(responseCode = "200", description = "장소 영업시간과 메뉴를 조회했습니다.",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = PlaceInfoResponse.class),
                                    examples = @ExampleObject(name = "성수 카페", value = """
                                            {
                                              "openingHours": [
                                                {
                                                  "dayOfWeek": "MONDAY",
                                                  "periods": [
                                                    { "opensAt": "11:00", "closesAt": "15:00" },
                                                    { "opensAt": "17:00", "closesAt": "21:00" }
                                                  ]
                                                },
                                                {
                                                  "dayOfWeek": "FRIDAY",
                                                  "periods": [
                                                    { "opensAt": "18:00", "closesAt": "02:00" }
                                                  ]
                                                },
                                                { "dayOfWeek": "SUNDAY", "periods": [] }
                                              ],
                                              "menus": [
                                                { "name": "아메리카노", "price": 4500 },
                                                { "name": "오늘의 디저트", "price": null }
                                              ]
                                            }
                                            """))),
                    @ApiResponse(responseCode = "401", description = "토큰이 없거나 유효하지 않습니다.",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = ErrorResponse.class))),
                    @ApiResponse(responseCode = "404", description = "존재하지 않는 장소입니다.",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = ErrorResponse.class),
                                    examples = @ExampleObject(name = "PLACE404_003", value = """
                                            {"message": "존재하지 않는 장소입니다.", "errorCode": "PLACE404_003"}
                                            """)))
            })
    ResponseEntity<PlaceInfoResponse> readPlaceInfo(
            @Parameter(description = "장소 ID(places.id)", example = "1") Long placeId);

    @Operation(summary = "장소가 나온 내 게시글 조회",
            description = """
                    `placeId` 장소가 추출된 내 게시글 목록으로, 장소 상세와 지도 바텀시트에서 씁니다.

                    - 보관함 저장 여부와 관계없이 장소가 추출된 내 게시글을 돌려주므로, 저장하지 않은 장소나 지웠다가 다시 저장한 장소도 게시글이 모두 나옵니다.
                    - 분석에 성공한 내 공유만 돌려주며, 내 공유가 실패했으면 다른 회원의 공유로 게시물 분석이 성공해도 넣지 않습니다.
                    - 보관함 게시물 삭제(`DELETE /api/v1/saved-media`)로 지운 게시글은 빠집니다.
                    - 같은 게시물을 여러 번 공유했으면 분석에 성공했고 지우지 않은 공유 가운데 가장 최근 한 건만 돌려줍니다.
                    - `createdAt` 내림차순으로 정렬하고 같은 시각에는 `sharedMediaId` 내림차순으로 정렬합니다.
                    - 해당하는 게시글이 없거나 없는 장소 ID면 빈 `media` 배열을 돌려줍니다.
                    - 항목 필드는 `GET /api/v1/saved-places/{savedPlaceId}/media`의 항목과 같습니다.
                    - `thumbnailUrl`은 게시물 썸네일이 없으면 null입니다.
                    """,
            security = @SecurityRequirement(name = "access-token"),
            responses = {
                    @ApiResponse(responseCode = "200", description = "장소가 나온 내 게시글 목록을 돌려주며 게시글이 없으면 빈 배열을 돌려줍니다.",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = PlaceMediaResponses.class),
                                    examples = @ExampleObject(name = "성수 카페 게시글", value = """
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
                    @ApiResponse(responseCode = "401", description = "토큰이 없거나 유효하지 않습니다.",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = ErrorResponse.class),
                                    examples = {
                                            @ExampleObject(name = "AUTH401_004", description = "Authorization 헤더가 없거나 Bearer 형식이 아닐 때 돌려줍니다.",
                                                    value = """
                                                    {"message": "로그인이 필요한 요청입니다.", "errorCode": "AUTH401_004"}
                                                    """),
                                            @ExampleObject(name = "AUTH401_001", description = "토큰이 깨졌거나 만료됐거나 액세스 토큰이 아닐 때 돌려줍니다.",
                                                    value = """
                                                    {"message": "인증 토큰이 유효하지 않습니다.", "errorCode": "AUTH401_001"}
                                                    """)
                                    }))
            })
    ResponseEntity<PlaceMediaResponses> readPlaceMedia(Long memberId,
                                                       @Parameter(description = "장소 ID(places.id)이며 보관함 목록의 `placeId`, 게시물 탭의 `places[].placeId`와 같은 값입니다.", example = "1")
                                                       Long placeId);
}
