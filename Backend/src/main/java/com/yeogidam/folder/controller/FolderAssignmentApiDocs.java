package com.yeogidam.folder.controller;

import com.yeogidam.folder.dto.request.FolderAssignmentRequest;
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
 * FolderAssignmentController의 Swagger 문서로, 문서 어노테이션만 두고 요청 매핑과 인증 파라미터는 구현체가 맡는다.
 * description은 Markdown으로 그려지므로 줄을 바꾸려면 빈 줄이나 목록 문법을 쓴다.
 */
@Tag(name = "Folder", description = "폴더 API입니다.")
public interface FolderAssignmentApiDocs {

    @Operation(summary = "보관함 장소를 폴더에 담기",
            description = """
                    폴더 선택 시트에서 저장을 누르면, 보관함 장소가 담긴 폴더를 체크된 목록과 똑같이 맞춥니다.

                    - `folderIds`에는 체크된 폴더 id를 모두 보냅니다.
                    - `folderIds`에는 폴더 id를 20개까지 보낼 수 있습니다.
                    - 목록에 없는 폴더에서는 빼고 새로 체크한 폴더에는 넣으며, 이미 담긴 폴더는 그대로 둡니다.
                    - 빈 배열을 보내면 모든 폴더에서 빼고, 장소는 보관함에 남깁니다.
                    - 같은 폴더 id가 두 번 오면 한 번만 담고, 같은 요청을 다시 보내도 결과가 같습니다.
                    """,
            security = @SecurityRequirement(name = "access-token"),
            responses = {
                    @ApiResponse(responseCode = "204", description = "폴더 담기를 완료했습니다."),
                    @ApiResponse(responseCode = "400", description = "요청 값이 규칙에 맞지 않습니다.",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = ErrorResponse.class),
                                    examples = @ExampleObject(name = "COMMON400_001", description = "`folderIds`가 없거나, 목록에 null이 있거나, 폴더 id가 20개를 넘을 때 돌려줍니다.",
                                            value = """
                                            {"message": "유효하지 않은 요청 필드입니다.", "errorCode": "COMMON400_001"}
                                            """))),
                    @ApiResponse(responseCode = "404", description = "보관함 장소나 폴더 중 하나라도 없거나 남의 것입니다.",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = ErrorResponse.class),
                                    examples = @ExampleObject(name = "FOLDER404_002",
                                            value = """
                                            {"message": "보관함 장소나 폴더를 찾을 수 없습니다.", "errorCode": "FOLDER404_002"}
                                            """))),
                    @ApiResponse(responseCode = "401", description = "토큰이 없거나 유효하지 않습니다.",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = ErrorResponse.class)))
            })
    ResponseEntity<Void> updateFolderAssignment(Long memberId,
                                                @Parameter(description = "보관함 항목 ID(saved_places.id)입니다.", example = "11")
                                                Long savedPlaceId,
                                                FolderAssignmentRequest request);
}
