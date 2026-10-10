package com.yeogidam.auth.controller;

import com.yeogidam.auth.dto.response.AuthorizationUrlResponse;
import com.yeogidam.global.dto.ErrorResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.headers.Header;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

/**
 * OAuthAuthorizationController의 Swagger 문서. 문서 어노테이션만 두고, 요청 매핑과 파라미터 바인딩은 구현체가 맡는다.
 */
@Tag(name = "OAuth", description = "앱이 인앱 브라우저로 카카오, 구글 로그인을 열고 인가 코드를 받아 오는 API")
public interface OAuthAuthorizationApiDocs {

    @Operation(summary = "카카오 인가 URL 발급",
            description = """
                    앱이 인앱 브라우저로 열 카카오 로그인 주소를 돌려줍니다. 로그인 전에 부르므로 인증 없이 호출합니다.

                    - 주소에는 서버 설정의 `client_id`, `redirect_uri`와 `response_type=code`, `state`가 들어 있습니다.
                    - 앱은 받은 주소를 앱 스킴(`com.yeogidamm.app://auth-callback`)을 기다리는 인앱 브라우저로 엽니다.
                      로그인을 마치면 카카오가 서버 콜백으로 돌아오고, 서버가 앱 스킴으로 인가 코드를 넘깁니다.
                    - `state`는 10분 동안 유효하므로 로그인할 때마다 새로 받습니다.
                    """,
            responses = {
                    @ApiResponse(responseCode = "200", description = "카카오 인가 URL",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = AuthorizationUrlResponse.class),
                                    examples = @ExampleObject(value = """
                                            {"authorizationUrl": "https://kauth.kakao.com/oauth/authorize?client_id=abc123\
                                            &redirect_uri=https://api.example.com/oauth/kakao/callback&response_type=code\
                                            &state=eyJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJ5ZW9naWRhbSJ9.c2ln"}
                                            """))),
                    @ApiResponse(responseCode = "503", description = "서버에 카카오 연동 설정이 없음",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = ErrorResponse.class),
                                    examples = @ExampleObject(value = """
                                            {"message": "소셜 로그인 설정이 준비되지 않았습니다.", "errorCode": "AUTH503_001"}
                                            """)))
            })
    ResponseEntity<AuthorizationUrlResponse> readKakaoAuthorizationUrl();

    @Operation(summary = "구글 인가 URL 발급",
            description = """
                    앱이 인앱 브라우저로 열 구글 로그인 주소를 돌려줍니다. 로그인 전에 부르므로 인증 없이 호출합니다.

                    - 주소에는 서버 설정의 `client_id`, `redirect_uri`와 `response_type=code`, `state`가 들어 있고,
                      서버가 사용자 정보를 읽는 데 필요한 `scope=openid email profile`도 들어 있습니다.
                    - 앱은 받은 주소를 앱 스킴(`com.yeogidamm.app://auth-callback`)을 기다리는 인앱 브라우저로 엽니다.
                      로그인을 마치면 구글이 서버 콜백으로 돌아오고, 서버가 앱 스킴으로 인가 코드를 넘깁니다.
                    - `state`는 10분 동안 유효하므로 로그인할 때마다 새로 받습니다.
                    """,
            responses = {
                    @ApiResponse(responseCode = "200", description = "구글 인가 URL",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = AuthorizationUrlResponse.class),
                                    examples = @ExampleObject(value = """
                                            {"authorizationUrl": "https://accounts.google.com/o/oauth2/v2/auth\
                                            ?client_id=abc123.apps.googleusercontent.com\
                                            &redirect_uri=https://api.example.com/oauth/google/callback\
                                            &response_type=code&scope=openid%20email%20profile\
                                            &state=eyJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJ5ZW9naWRhbSJ9.c2ln"}
                                            """))),
                    @ApiResponse(responseCode = "503", description = "서버에 구글 연동 설정이 없음",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = ErrorResponse.class),
                                    examples = @ExampleObject(value = """
                                            {"message": "소셜 로그인 설정이 준비되지 않았습니다.", "errorCode": "AUTH503_001"}
                                            """)))
            })
    ResponseEntity<AuthorizationUrlResponse> readGoogleAuthorizationUrl();

    @Operation(summary = "카카오 로그인 콜백",
            description = """
                    카카오가 로그인을 마친 브라우저를 서버 콜백으로 보냅니다. 앱은 콜백을 직접 부르지 않으며,
                    카카오 콘솔에 등록한 리다이렉트 URI가 콜백 주소와 글자까지 같아야 합니다.

                    - `state`를 확인한 뒤 `com.yeogidamm.app://auth-callback?provider=kakao&code={인가 코드}`로 302 합니다.
                      토큰은 만들지 않습니다.
                    - 사용자가 취소하는 등 카카오가 `error`로 돌려보내면
                      `com.yeogidamm.app://auth-callback?provider=kakao&error={오류 코드}`로 302 합니다.
                    - 앱은 받은 인가 코드로 `POST /api/v1/auth/logins/kakao`를 부릅니다.
                    - `state`가 서버가 만든 값이 아니거나 발급하고 10분이 지났으면 302 대신 400을 돌려줍니다.
                    """,
            responses = {
                    @ApiResponse(responseCode = "302", description = "앱 스킴으로 이동",
                            headers = @Header(name = "Location", description = "인가 코드나 오류를 실은 앱 콜백 주소",
                                    schema = @Schema(type = "string",
                                            example = "com.yeogidamm.app://auth-callback?provider=kakao&code=abc123"))),
                    @ApiResponse(responseCode = "400", description = "state가 위조되었거나 만료됨",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = ErrorResponse.class),
                                    examples = @ExampleObject(value = """
                                            {"message": "소셜 로그인 요청이 만료되었거나 유효하지 않습니다. 다시 로그인해 주세요.",
                                             "errorCode": "AUTH400_001"}
                                            """)))
            })
    ResponseEntity<Void> readKakaoCallback(
            @Parameter(description = "카카오가 준 인가 코드. 오류로 돌아오면 없다", example = "abc123") String code,
            @Parameter(description = "인가 URL에 실어 보낸 state") String state,
            @Parameter(description = "카카오가 준 오류 코드. 사용자가 취소하면 access_denied",
                    example = "access_denied") String error
    );

    @Operation(summary = "구글 로그인 콜백",
            description = """
                    구글이 로그인을 마친 브라우저를 서버 콜백으로 보냅니다. 앱은 콜백을 직접 부르지 않으며,
                    구글 콘솔에 등록한 리다이렉트 URI가 콜백 주소와 글자까지 같아야 합니다.

                    - `state`를 확인한 뒤 `com.yeogidamm.app://auth-callback?provider=google&code={인가 코드}`로 302 합니다.
                      토큰은 만들지 않습니다.
                    - 사용자가 취소하는 등 구글이 `error`로 돌려보내면
                      `com.yeogidamm.app://auth-callback?provider=google&error={오류 코드}`로 302 합니다.
                    - 앱은 받은 인가 코드로 `POST /api/v1/auth/logins/google`을 부릅니다.
                    - `state`가 서버가 만든 값이 아니거나 발급하고 10분이 지났으면 302 대신 400을 돌려줍니다.
                    """,
            responses = {
                    @ApiResponse(responseCode = "302", description = "앱 스킴으로 이동",
                            headers = @Header(name = "Location", description = "인가 코드나 오류를 실은 앱 콜백 주소",
                                    schema = @Schema(type = "string",
                                            example = "com.yeogidamm.app://auth-callback?provider=google&code=4/0Ab"))),
                    @ApiResponse(responseCode = "400", description = "state가 위조되었거나 만료됨",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = ErrorResponse.class),
                                    examples = @ExampleObject(value = """
                                            {"message": "소셜 로그인 요청이 만료되었거나 유효하지 않습니다. 다시 로그인해 주세요.",
                                             "errorCode": "AUTH400_001"}
                                            """)))
            })
    ResponseEntity<Void> readGoogleCallback(
            @Parameter(description = "구글이 준 인가 코드. 오류로 돌아오면 없다", example = "4/0Ab") String code,
            @Parameter(description = "인가 URL에 실어 보낸 state") String state,
            @Parameter(description = "구글이 준 오류 코드. 사용자가 취소하면 access_denied",
                    example = "access_denied") String error
    );
}
