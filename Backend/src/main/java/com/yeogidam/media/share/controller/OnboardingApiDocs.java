package com.yeogidam.media.share.controller;

import com.yeogidam.global.dto.ErrorResponse;
import com.yeogidam.media.share.dto.request.OnboardingShareRequest;
import com.yeogidam.media.share.dto.response.OnboardingShareResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

/**
 * OnboardingController의 Swagger 문서. 문서 어노테이션만 두고, 요청 매핑과 인증 파라미터는 구현체가 맡는다.
 */
@Tag(name = "Onboarding", description = "온보딩 때 보관함에 담은 장소를 가입한 회원의 보관함으로 옮기는 API")
public interface OnboardingApiDocs {

    @Operation(summary = "온보딩 보관함을 회원 보관함으로 옮기기",
            description = """
                    가입 전에는 회원이 없어서 서버에 보관함을 만들 수 없습니다. 그래서 온보딩에서 보관함에 담은 장소는 앱이 갖고 있다가
                    가입이 끝나면 이 API로 보냅니다. 서버는 온보딩 릴스의 공유 이력을 하나 만들고, 받은 장소를 회원 보관함에 저장해
                    그 이력에 연결합니다. 장소는 앱 번들과 서버 시드 데이터가 같이 쓰는 `kakaoPlaceId`로 보냅니다.

                    - 온보딩에서 장소를 모두 지웠으면 빈 배열로 보냅니다. 이력만 만들고 보관함에는 아무것도 넣지 않습니다.
                    - 온보딩 릴스에 없는 장소 id가 하나라도 있으면 요청 전체를 거절합니다. 앱 번들과 서버 시드 데이터가 서로 다를 때 생깁니다.
                    - 같은 id를 여러 번 보내도 한 번만 저장합니다.
                    - 가입 직후 한 번만 부릅니다. 이미 옮긴 회원이 다시 불러도 아무것도 바꾸지 않고 같은 이력 ID를 돌려주니,
                      호출에 실패했으면 다음 실행 때 같은 요청을 다시 보내면 됩니다.
                    - 응답에는 이력 ID만 있습니다. 옮긴 뒤의 보관함은 `GET /api/v1/saved-places`로 읽습니다.
                    """,
            security = @SecurityRequirement(name = "access-token"),
            responses = {
                    @ApiResponse(responseCode = "201", description = "장소를 옮겼거나, 이미 옮긴 회원이라 기존 이력을 돌려줌",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = OnboardingShareResponse.class),
                                    examples = @ExampleObject(value = """
                                            {"sharedMediaId": 42}
                                            """))),
                    @ApiResponse(responseCode = "400", description = "kakaoPlaceIds가 없거나 온보딩 릴스에 없는 장소가 있음",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = ErrorResponse.class),
                                    examples = {
                                            @ExampleObject(name = "COMMON400_001",
                                                    description = "본문에 kakaoPlaceIds가 없을 때",
                                                    value = """
                                                            {"message": "유효하지 않은 요청 필드입니다.", "errorCode": "COMMON400_001"}
                                                            """),
                                            @ExampleObject(name = "PLACE400_002",
                                                    description = "온보딩 릴스에 없는 장소 id가 있을 때",
                                                    value = """
                                                            {"message": "요청 장소를 찾을 수 없습니다.", "errorCode": "PLACE400_002"}
                                                            """)
                                    })),
                    @ApiResponse(responseCode = "401", description = "토큰 없음 또는 유효하지 않음",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = ErrorResponse.class))),
                    @ApiResponse(responseCode = "503", description = "온보딩 릴스가 서버 시드 데이터에 없음. 배포 설정 오류라 앱에서는 고칠 수 없음",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = ErrorResponse.class),
                                    examples = @ExampleObject(value = """
                                            {"message": "온보딩 미디어를 찾을 수 없습니다.", "errorCode": "MEDIA503_001"}
                                            """)))
            })
    ResponseEntity<OnboardingShareResponse> createOnboardingShare(Long memberId, @Valid OnboardingShareRequest request);
}
