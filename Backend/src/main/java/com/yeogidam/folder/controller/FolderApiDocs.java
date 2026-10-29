package com.yeogidam.folder.controller;

import com.yeogidam.folder.dto.request.FolderCreateRequest;
import com.yeogidam.folder.dto.request.FolderUpdateRequest;
import com.yeogidam.folder.dto.response.FolderCreateResponse;
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
                    - 앱은 받은 순서대로 위에서부터 그리고, 새 폴더는 맨 아래에 붙습니다.
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

    @Operation(summary = "폴더 만들기",
            description = """
                    새 폴더 창에서 폴더 하나를 만들고, 만든 폴더를 돌려줍니다.

                    - `name`과 `color`를 모두 보내야 합니다.
                    - 이름은 앞뒤 공백을 뺀 1자 이상 15자 이하이고, 같은 회원의 기존 폴더와 겹칠 수 없습니다.
                    - 이름에는 줄바꿈이나 탭 같은 제어 문자를 넣을 수 없습니다.
                    - `color`는 `RED`, `ORANGE`, `YELLOW`, `GREEN`, `TEAL`, `PURPLE`, `PINK` 중 하나이고, 대소문자를 구분합니다.
                    - 폴더는 회원마다 최대 10개까지 만들 수 있습니다.
                    """,
            security = @SecurityRequirement(name = "access-token"),
            responses = {
                    @ApiResponse(responseCode = "201", description = "만든 폴더를 돌려줍니다.",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = FolderCreateResponse.class),
                                    examples = @ExampleObject(name = "만든 폴더", value = """
                                            {"folderId": 3, "name": "가보고 싶은 곳", "color": "GREEN"}
                                            """))),
                    @ApiResponse(responseCode = "400", description = "요청 값이 규칙에 맞지 않거나 폴더가 이미 10개입니다.",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = ErrorResponse.class),
                                    examples = {
                                            @ExampleObject(name = "FOLDER400_001", description = "폴더가 이미 10개일 때 돌려줍니다.",
                                                    value = """
                                                    {"message": "폴더는 최대 10개까지 만들 수 있습니다.", "errorCode": "FOLDER400_001"}
                                                    """),
                                            @ExampleObject(name = "FOLDER400_002", description = "이름이 공백뿐이거나, 15자를 넘거나, 줄바꿈이나 탭 같은 제어 문자가 있을 때 돌려줍니다.",
                                                    value = """
                                                    {"message": "폴더 이름은 줄바꿈이나 탭 없이 앞뒤 공백을 뺀 1자 이상 15자 이하여야 합니다.", "errorCode": "FOLDER400_002"}
                                                    """),
                                            @ExampleObject(name = "FOLDER400_003", description = "`color`가 정해진 7가지가 아니거나 소문자가 섞였을 때 돌려줍니다.",
                                                    value = """
                                                    {"message": "color는 RED, ORANGE, YELLOW, GREEN, TEAL, PURPLE, PINK 중 하나여야 합니다.", "errorCode": "FOLDER400_003"}
                                                    """),
                                            @ExampleObject(name = "COMMON400_001", description = "`name`이나 `color`가 없을 때 돌려줍니다.",
                                                    value = """
                                                    {"message": "유효하지 않은 요청 필드입니다.", "errorCode": "COMMON400_001"}
                                                    """)
                                    })),
                    @ApiResponse(responseCode = "409", description = "같은 회원의 기존 폴더와 이름이 겹칩니다.",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = ErrorResponse.class),
                                    examples = @ExampleObject(name = "FOLDER409_001",
                                            value = """
                                            {"message": "같은 이름의 폴더가 이미 있습니다.", "errorCode": "FOLDER409_001"}
                                            """))),
                    @ApiResponse(responseCode = "401", description = "토큰이 없거나 유효하지 않습니다.",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = ErrorResponse.class)))
            })
    ResponseEntity<FolderCreateResponse> createFolder(Long memberId, FolderCreateRequest request);

    @Operation(summary = "폴더 수정",
            description = """
                    폴더 수정 창에서 폴더 이름과 색을 함께 바꿉니다.

                    - `name`과 `color`를 모두 보내야 합니다.
                    - 이름은 앞뒤 공백을 뺀 1자 이상 15자 이하이고, 같은 회원의 다른 폴더와 겹칠 수 없습니다.
                    - 이름에는 줄바꿈이나 탭 같은 제어 문자를 넣을 수 없습니다.
                    - 이름은 그대로 두고 색만 바꿔도 됩니다.
                    - `color`는 `RED`, `ORANGE`, `YELLOW`, `GREEN`, `TEAL`, `PURPLE`, `PINK` 중 하나이고, 대소문자를 구분합니다.
                    """,
            security = @SecurityRequirement(name = "access-token"),
            responses = {
                    @ApiResponse(responseCode = "204", description = "수정을 완료했습니다."),
                    @ApiResponse(responseCode = "400", description = "요청 값이 규칙에 맞지 않습니다.",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = ErrorResponse.class),
                                    examples = {
                                            @ExampleObject(name = "FOLDER400_002", description = "이름이 공백뿐이거나, 15자를 넘거나, 줄바꿈이나 탭 같은 제어 문자가 있을 때 돌려줍니다.",
                                                    value = """
                                                    {"message": "폴더 이름은 줄바꿈이나 탭 없이 앞뒤 공백을 뺀 1자 이상 15자 이하여야 합니다.", "errorCode": "FOLDER400_002"}
                                                    """),
                                            @ExampleObject(name = "COMMON400_001", description = "`name`이나 `color`가 없을 때 돌려줍니다.",
                                                    value = """
                                                    {"message": "유효하지 않은 요청 필드입니다.", "errorCode": "COMMON400_001"}
                                                    """),
                                            @ExampleObject(name = "FOLDER400_003", description = "`color`가 정해진 7가지가 아니거나 소문자가 섞였을 때 돌려줍니다.",
                                                    value = """
                                                    {"message": "color는 RED, ORANGE, YELLOW, GREEN, TEAL, PURPLE, PINK 중 하나여야 합니다.", "errorCode": "FOLDER400_003"}
                                                    """)
                                    })),
                    @ApiResponse(responseCode = "404", description = "없는 폴더이거나 남의 폴더입니다.",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = ErrorResponse.class),
                                    examples = @ExampleObject(name = "FOLDER404_001",
                                            value = """
                                            {"message": "폴더를 찾을 수 없습니다.", "errorCode": "FOLDER404_001"}
                                            """))),
                    @ApiResponse(responseCode = "409", description = "같은 회원의 다른 폴더와 이름이 겹칩니다.",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = ErrorResponse.class),
                                    examples = @ExampleObject(name = "FOLDER409_001",
                                            value = """
                                            {"message": "같은 이름의 폴더가 이미 있습니다.", "errorCode": "FOLDER409_001"}
                                            """))),
                    @ApiResponse(responseCode = "401", description = "토큰이 없거나 유효하지 않습니다.",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = ErrorResponse.class)))
            })
    ResponseEntity<Void> updateFolder(Long memberId,
                                      @Parameter(description = "폴더 id(folders.id)", example = "1")
                                      Long folderId,
                                      FolderUpdateRequest request);

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
