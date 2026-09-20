package com.yeogidam.member.controller;

import com.yeogidam.global.dto.ErrorResponse;
import com.yeogidam.member.dto.request.DeleteMemberRequest;
import com.yeogidam.member.dto.response.MemberResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

@Tag(name = "Member", description = "회원 API")
public interface MemberApiDocs {

    @Operation(summary = "내 정보 조회",
            description = """
                    로그인한 회원의 내 정보를 돌려줍니다.
                    """,
            security = @SecurityRequirement(name = "access-token"),
            responses = {
                    @ApiResponse(responseCode = "200", description = "내 정보 조회 성공",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = MemberResponse.class))),
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
                    @ApiResponse(responseCode = "404", description = "존재하지 않는 회원",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = ErrorResponse.class),
                                    examples = @ExampleObject(name = "USER404_001",
                                            value = """
                                                    {"message": "존재하지 않는 사용자입니다.", "errorCode": "USER404_001"}
                                                    """)))
            })
    ResponseEntity<MemberResponse> readMe(Long memberId);

    @Operation(summary = "회원 탈퇴",
            description = """
                    소셜 계정 연결을 해제하고 회원과 회원 소유 데이터를 삭제합니다.

                    - 요청한 인가 코드의 소셜 계정이 현재 로그인한 회원과 같은지 확인합니다.
                    - `media`, `places`, `media_places`처럼 여러 회원이 함께 사용하는 데이터는 유지합니다.
                    """,
            security = @SecurityRequirement(name = "access-token"),
            responses = {
                    @ApiResponse(responseCode = "204", description = "회원 탈퇴 완료"),
                    @ApiResponse(responseCode = "401", description = "토큰 없음, 유효하지 않은 토큰 또는 소셜 계정 불일치",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = ErrorResponse.class),
                                    examples = {
                                            @ExampleObject(name = "AUTH401_004",
                                                    description = "Authorization 헤더가 없거나 Bearer 형식이 아닐 때",
                                                    value = """
                                                            {"message": "로그인이 필요한 요청입니다.", "errorCode": "AUTH401_004"}
                                                            """),
                                            @ExampleObject(name = "AUTH401_001",
                                                    description = "액세스 토큰이 유효하지 않을 때",
                                                    value = """
                                                            {"message": "인증 토큰이 유효하지 않습니다.", "errorCode": "AUTH401_001"}
                                                            """),
                                            @ExampleObject(name = "AUTH401_002",
                                                    description = "인가 코드의 소셜 계정이 현재 회원과 다를 때",
                                                    value = """
                                                            {"message": "소셜 로그인 인증 정보가 유효하지 않습니다.", "errorCode": "AUTH401_002"}
                                                            """)
                                    })),
                    @ApiResponse(responseCode = "404", description = "존재하지 않는 회원",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = ErrorResponse.class),
                                    examples = @ExampleObject(name = "USER404_001",
                                            value = """
                                                    {"message": "존재하지 않는 사용자입니다.", "errorCode": "USER404_001"}
                                                    """))),
                    @ApiResponse(responseCode = "502", description = "소셜 제공자 연결 해제 실패",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = ErrorResponse.class),
                                    examples = @ExampleObject(name = "AUTH502_001",
                                            value = """
                                                    {"message": "소셜 로그인 제공자에 연결할 수 없습니다.", "errorCode": "AUTH502_001"}
                                                    """)))
            })
    ResponseEntity<Void> deleteMe(Long memberId, DeleteMemberRequest request);
}
