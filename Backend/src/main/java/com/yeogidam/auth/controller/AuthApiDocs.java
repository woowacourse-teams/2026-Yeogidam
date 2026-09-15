package com.yeogidam.auth.controller;

import com.yeogidam.auth.dto.request.LoginRequest;
import com.yeogidam.auth.dto.request.RefreshTokenRequest;
import com.yeogidam.auth.dto.response.LoginResponse;
import com.yeogidam.auth.dto.response.TokenResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;

/**
 * AuthController의 Swagger 문서. 문서 어노테이션만 두고, 요청 매핑과 검증은 구현체가 맡는다.
 */
@Tag(name = "Auth", description = "소셜 로그인, 토큰 재발급, 로그아웃 API")
public interface AuthApiDocs {

    @Operation(summary = "카카오 로그인", description = "카카오 인가 코드로 로그인하고 토큰 쌍과 회원 정보를 돌려줍니다. 처음 로그인한 계정은 회원으로 등록합니다.")
    ResponseEntity<LoginResponse> createKakaoLogin(LoginRequest request);

    @Operation(summary = "구글 로그인", description = "구글 인가 코드로 로그인하고 토큰 쌍과 회원 정보를 돌려줍니다. 처음 로그인한 계정은 회원으로 등록합니다.")
    ResponseEntity<LoginResponse> createGoogleLogin(LoginRequest request);

    @Operation(summary = "애플 로그인", description = "애플 인가 코드로 로그인하고 토큰 쌍과 회원 정보를 돌려줍니다. 처음 로그인한 계정은 회원으로 등록합니다.")
    ResponseEntity<LoginResponse> createAppleLogin(LoginRequest request);

    @Operation(summary = "토큰 재발급", description = "리프레시 토큰으로 새 토큰 쌍을 발급합니다. 이전 리프레시 토큰은 더 쓸 수 없고, 이미 쓴 토큰을 다시 보내면 그 세션의 새 토큰도 함께 막힙니다.")
    ResponseEntity<TokenResponse> reissueTokens(RefreshTokenRequest request);

    @Operation(summary = "로그아웃", description = "리프레시 토큰의 세션을 끝냅니다. 이미 끝난 세션의 토큰으로 다시 보내도 204를 돌려줍니다.",
            responses = @ApiResponse(responseCode = "204", description = "로그아웃 완료"))
    ResponseEntity<Void> createLogout(RefreshTokenRequest request);
}
