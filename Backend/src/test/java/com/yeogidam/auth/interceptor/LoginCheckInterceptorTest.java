package com.yeogidam.auth.interceptor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.yeogidam.auth.exception.AuthErrorCode;
import com.yeogidam.auth.exception.AuthException;
import com.yeogidam.auth.infrastructure.jwt.JwtTokenProvider;
import com.yeogidam.support.JwtFixture;
import com.yeogidam.support.MutableClock;
import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

/**
 * 인터셉터는 MVC 인프라 컴포넌트라 직접 호출로 검증한다. 401 응답 모양은 E2E가 맡는다.
 */
class LoginCheckInterceptorTest {

    private final MutableClock clock = new MutableClock(JwtFixture.NOW);
    private final JwtTokenProvider jwtTokenProvider = JwtFixture.jwtTokenProvider(clock);
    private final LoginCheckInterceptor interceptor = new LoginCheckInterceptor(jwtTokenProvider);

    @Test
    void 유효한_액세스_토큰이면_통과한다() {
        // given
        String accessToken = jwtTokenProvider.createAccessToken(7L)
                .value();

        // when & then
        assertThat(preHandle("Bearer " + accessToken)).isTrue();
    }

    @Test
    void 토큰이_없으면_로그인_필요_예외가_발생한다() {
        assertAuthException(() -> interceptor.preHandle(
                new MockHttpServletRequest(), new MockHttpServletResponse(), new Object()),
                AuthErrorCode.AUTHENTICATION_REQUIRED);
    }

    @Test
    void 리프레시_토큰을_보내면_유효하지_않은_토큰_예외가_발생한다() {
        // given
        String refreshToken = jwtTokenProvider.createRefreshToken(7L, "session-1")
                .value();

        // when & then
        assertAuthException(() -> preHandle("Bearer " + refreshToken), AuthErrorCode.INVALID_TOKEN);
    }

    @Test
    void 만료된_액세스_토큰이면_유효하지_않은_토큰_예외가_발생한다() {
        // given
        String accessToken = jwtTokenProvider.createAccessToken(7L)
                .value();
        clock.advance(JwtFixture.PROPERTIES.accessTokenTtl()
                .plusMinutes(2));

        // when & then
        assertAuthException(() -> preHandle("Bearer " + accessToken), AuthErrorCode.INVALID_TOKEN);
    }

    private boolean preHandle(String authorizationHeader) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader(HttpHeaders.AUTHORIZATION, authorizationHeader);
        return interceptor.preHandle(request, new MockHttpServletResponse(), new Object());
    }

    private static void assertAuthException(
            org.assertj.core.api.ThrowableAssert.ThrowingCallable callable,
            AuthErrorCode errorCode
    ) {
        assertThatThrownBy(callable)
                .isInstanceOf(AuthException.class)
                .extracting("errorCode")
                .isEqualTo(errorCode);
    }
}
