package com.yeogidam.folder.controller;

import com.yeogidam.folder.dto.response.FolderResponses;
import com.yeogidam.global.dto.ErrorResponse;
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
 * FolderController의 Swagger 문서로, 문서 어노테이션만 두고 요청 매핑과 인증 파라미터는 구현체가 맡는다.
 * description은 Markdown으로 그려지므로 줄을 바꾸려면 빈 줄이나 목록 문법을 쓴다.
 */
@Tag(name = "Folder", description = "폴더 API입니다.")
public interface FolderApiDocs {

    @Operation(summary = "폴더 목록 조회",
            description = """
                    로그인한 회원의 폴더를 만든 순서로 돌려줍니다.

                    - 폴더 탭의 목록과 폴더 선택 시트가 같은 응답을 씁니다.
                    - `folderId` 오름차순(만든 순서)으로 정렬합니다.
                    - `color`는 `RED`, `ORANGE`, `YELLOW`, `GREEN`, `TEAL`, `PURPLE`, `PINK` 중 하나이고, 실제 색 값은 앱이 정합니다.
                    """,
            security = @SecurityRequirement(name = "access-token"),
            responses = {
                    @ApiResponse(responseCode = "200", description = "폴더 목록을 돌려주며, 만든 폴더가 없으면 `folders`에 빈 배열을 담습니다.",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = FolderResponses.class),
                                    examples = @ExampleObject(name = "폴더 두 개", value = """
                                            {
                                              "folders": [
                                                {"folderId": 1, "name": "데이트 장소", "color": "RED"},
                                                {"folderId": 2, "name": "성수 카페", "color": "TEAL"}
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
    ResponseEntity<FolderResponses> readFolders(Long memberId);

    @Operation(summary = "폴더 삭제",
            description = """
                    폴더 더보기의 삭제 확인에서 폴더 하나를 지웁니다.

                    - 폴더와 폴더에 담긴 연결만 지우고, 보관함의 장소는 남습니다.
                    - 이미 지웠거나 없는 폴더, 남의 폴더여도 "그 폴더가 내 목록에 없다"는 결과가 같아 204를 돌려주므로 멱등합니다.
                    """,
            security = @SecurityRequirement(name = "access-token"),
            responses = {
                    @ApiResponse(responseCode = "204", description = "삭제를 완료했습니다."),
                    @ApiResponse(responseCode = "401", description = "토큰이 없거나 유효하지 않습니다.",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = ErrorResponse.class)))
            })
    ResponseEntity<Void> deleteFolder(Long memberId,
                                      @Parameter(description = "폴더 id(folders.id)", example = "1")
                                      Long folderId);
}
