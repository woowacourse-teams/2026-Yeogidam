package com.yeogidam.auth.interceptor;

import com.yeogidam.auth.exception.AuthErrorCode;
import com.yeogidam.auth.exception.AuthException;
import com.yeogidam.auth.infrastructure.jwt.JwtTokenProvider;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * 인증이 필요한 경로에서 액세스 토큰이 있고 유효한지 확인한다. 토큰이 없으면 로그인 필요, 깨졌거나 만료됐으면 유효하지 않은 토큰이다.
 */
@Component
@RequiredArgsConstructor
public class LoginCheckInterceptor implements HandlerInterceptor {

    private final JwtTokenProvider jwtTokenProvider;

    @Override
    public boolean preHandle(
            HttpServletRequest request,
            HttpServletResponse response,
            Object handler
    ) {
        String token = TokenExtractor.extract(request)
                .orElseThrow(() -> new AuthException(AuthErrorCode.AUTHENTICATION_REQUIRED));
        jwtTokenProvider.parseAccessToken(token);
        return true;
    }
}
