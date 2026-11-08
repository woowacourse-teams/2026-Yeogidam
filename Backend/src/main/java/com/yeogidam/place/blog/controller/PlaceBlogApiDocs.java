package com.yeogidam.place.blog.controller;

import com.yeogidam.global.dto.ErrorResponse;
import com.yeogidam.place.blog.dto.response.PlaceBlogResponses;
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
 * PlaceBlogController의 Swagger 문서로, 장소 API와 같은 Place 태그 아래에 보인다.
 */
@Tag(name = "Place", description = "장소 API입니다.")
public interface PlaceBlogApiDocs {

    @Operation(summary = "장소 블로그 글 조회",
            description = """
                    장소 이름과 지번 주소의 동으로 네이버 블로그를 검색해, 검색 결과 순서대로 최대 5개를 돌려줍니다.
                    서버는 결과를 저장하거나 캐시하지 않고 요청마다 네이버를 부르므로, 블로그 탭을 열 때만 부릅니다.

                    - 검색어는 「장소 이름 + 동」이고, 동은 지번 주소에서 읍, 면, 동, 로나 「숫자+가」로 끝나는 첫 낱말입니다. `성수동2가`처럼 끝에 「숫자+가」가 붙은 동은 `성수동`으로 줄이고, 동을 찾지 못하면 장소 이름만 씁니다.
                    - `title`, `bloggerName`, `link`는 HTML 엔티티를 글자로 바꾸고 검색 강조 태그(`<b>`)를 걷을 뿐, 순서와 내용은 바꾸지 않습니다.
                    - 제목이나 원문 주소(`link`)가 없는 결과는 보여 줄 수 없어 빼므로, 5개보다 적게 올 수 있습니다.
                    - `bloggerName`은 블로그 이름이 없으면 `null`입니다.
                    - `postDate`는 yyyy-MM-dd이고, 네이버가 준 날짜를 읽지 못하면 `null`입니다.
                    - 검색 결과가 없으면 빈 `items` 배열을 돌려줍니다.
                    - 네이버 검색 API 약관에 따라 앱은 네이버 BI 가이드대로 목록 위에 네이버 블로그 검색 결과임을 표시하고, 결과 순서를 바꾸지 않고 목록의 앞, 뒤, 사이에 다른 글을 넣지 않으며, 블로그 탭 화면에는 광고를 넣지 않고, 글을 누르면 `link`로 이동합니다.
                    """,
            security = @SecurityRequirement(name = "access-token"),
            responses = {
                    @ApiResponse(responseCode = "200", description = "장소 블로그 글을 조회했고, 검색 결과가 없으면 빈 배열을 돌려줍니다.",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = PlaceBlogResponses.class),
                                    examples = @ExampleObject(name = "성수 카페", value = """
                                            {
                                              "source": "NAVER",
                                              "items": [
                                                {
                                                  "title": "카페 온월 성수동 디저트 후기",
                                                  "bloggerName": "성수 산책",
                                                  "postDate": "2026-11-02",
                                                  "link": "https://blog.naver.com/seongsu_walk/224000000001"
                                                }
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
                                            """))),
                    @ApiResponse(responseCode = "502", description = "네이버 블로그 검색이 오류를 돌려줬거나, 3초 안에 응답하지 않았거나, 응답을 읽지 못했거나, 응답에 검색 결과 목록이 없습니다.",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = ErrorResponse.class),
                                    examples = @ExampleObject(name = "PLACE502_001", value = """
                                            {"message": "블로그 검색 결과를 가져오지 못했습니다.", "errorCode": "PLACE502_001"}
                                            """)))
            })
    ResponseEntity<PlaceBlogResponses> readPlaceBlogs(
            @Parameter(description = "장소 ID(places.id)", example = "1") Long placeId);
}
