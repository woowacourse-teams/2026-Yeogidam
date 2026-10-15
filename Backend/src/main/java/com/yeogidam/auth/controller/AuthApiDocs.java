package com.yeogidam.auth.controller;

import com.yeogidam.auth.dto.request.AppleLoginRequest;
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

    @Operation(summary = "카카오 로그인",
            description = """
                    카카오 인가 코드로 로그인하고 토큰 쌍과 회원 정보를 돌려줍니다. 처음 로그인한 계정은 회원으로 등록합니다.
                    이번 요청으로 회원을 등록했으면 `isNewMember`에 true를 담고, 이미 가입한 회원이거나 같은 계정으로 동시에 들어온 다른 요청이 먼저 등록했으면 false를 담습니다.
                    앱은 `isNewMember`가 true이고 기기에 온보딩 기록이 있으면 `POST /api/v1/onboarding/saved-places`를 부르고,
                    호출에 실패했으면 다음 실행 때 같은 요청을 다시 보냅니다.
                    제공자가 닉네임을 주지 않으면 서버가 "담이 3432"처럼 "담이"와 네 자리 숫자로 닉네임을 정하고, 다시 로그인해도 닉네임은 바뀌지 않습니다.
                    """)
    ResponseEntity<LoginResponse> createKakaoLogin(LoginRequest request);

    @Operation(summary = "구글 로그인",
            description = """
                    구글 인가 코드로 로그인하고 토큰 쌍과 회원 정보를 돌려줍니다. 처음 로그인한 계정은 회원으로 등록합니다.
                    이번 요청으로 회원을 등록했으면 `isNewMember`에 true를 담고, 이미 가입한 회원이거나 같은 계정으로 동시에 들어온 다른 요청이 먼저 등록했으면 false를 담습니다.
                    앱은 `isNewMember`가 true이고 기기에 온보딩 기록이 있으면 `POST /api/v1/onboarding/saved-places`를 부르고,
                    호출에 실패했으면 다음 실행 때 같은 요청을 다시 보냅니다.
                    제공자가 닉네임을 주지 않으면 서버가 "담이 3432"처럼 "담이"와 네 자리 숫자로 닉네임을 정하고, 다시 로그인해도 닉네임은 바뀌지 않습니다.
                    """)
    ResponseEntity<LoginResponse> createGoogleLogin(LoginRequest request);

    @Operation(summary = "애플 로그인",
            description = """
                    애플 인가 코드로 로그인하고 토큰 쌍과 회원 정보를 돌려줍니다. 처음 로그인한 계정은 회원으로 등록합니다.
                    이번 요청으로 회원을 등록했으면 `isNewMember`에 true를 담고, 이미 가입한 회원이거나 같은 계정으로 동시에 들어온 다른 요청이 먼저 등록했으면 false를 담습니다.
                    앱은 `isNewMember`가 true이고 기기에 온보딩 기록이 있으면 `POST /api/v1/onboarding/saved-places`를 부르고,
                    호출에 실패했으면 다음 실행 때 같은 요청을 다시 보냅니다.
                    애플은 이름을 첫 인증 때 앱에만 주므로, 앱이 받은 이름을 `fullName`에 담아 보냅니다. 한글 이름은 "홍길동"처럼 성과 이름을 붙이고, 영문 이름은 "Minsu Kim"처럼 이름과 성 순서로 보냅니다.
                    `fullName`은 선택 값이고 255자까지 받습니다. 보내지 않거나 비어 있으면 서버가 "담이 3432"처럼 "담이"와 네 자리 숫자로 닉네임을 정하고, 다시 로그인해도 닉네임은 바뀌지 않습니다.
                    """)
    ResponseEntity<LoginResponse> createAppleLogin(AppleLoginRequest request);

    @Operation(summary = "토큰 재발급",
            description = """
                    리프레시 토큰으로 새 토큰 쌍을 발급합니다. 이전 리프레시 토큰은 더 쓸 수 없고, 이미 쓴 토큰을 다시 보내면 그 세션의 새 토큰도 함께 막힙니다(AUTH401_003).
                    방금 교체된 직전 토큰을 교체 뒤 10초 안에 다시 보내면 세션은 그대로 두고 401(AUTH401_005)만 돌려줍니다. 앱과 share extension이 같은 토큰으로 거의 동시에 재발급한 경우이므로, 이 응답을 받은 쪽은 재발급을 다시 요청하지 않고 공유 저장소를 다시 읽어 상대가 저장해 둔 새 토큰을 씁니다.
                    """)
    ResponseEntity<TokenResponse> reissueTokens(RefreshTokenRequest request);

    @Operation(summary = "로그아웃",
            description = "리프레시 토큰의 세션을 끝냅니다. 이미 끝난 세션의 토큰으로 다시 보내도 204를 돌려줍니다.",
            responses = @ApiResponse(responseCode = "204", description = "로그아웃 완료"))
    ResponseEntity<Void> createLogout(RefreshTokenRequest request);
}
