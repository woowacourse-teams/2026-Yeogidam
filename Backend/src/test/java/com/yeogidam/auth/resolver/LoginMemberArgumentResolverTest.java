package com.yeogidam.auth.resolver;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.yeogidam.auth.exception.AuthErrorCode;
import com.yeogidam.auth.exception.AuthException;
import com.yeogidam.auth.infrastructure.jwt.JwtTokenProvider;
import com.yeogidam.member.domain.Member;
import com.yeogidam.support.JwtFixture;
import com.yeogidam.support.MutableClock;
import java.lang.reflect.Method;
import org.junit.jupiter.api.Test;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.context.request.ServletWebRequest;

/**
 * 리졸버는 MVC 인프라 컴포넌트라 직접 호출로 검증한다. 어느 파라미터를 맡는지와 토큰에서 회원 식별자를 꺼내는지를 본다.
 */
class LoginMemberArgumentResolverTest {

    private final JwtTokenProvider jwtTokenProvider = JwtFixture.jwtTokenProvider(new MutableClock(JwtFixture.NOW));
    private final LoginMemberArgumentResolver resolver = new LoginMemberArgumentResolver(jwtTokenProvider);

    @Test
    void 어노테이션이_있고_Long_타입이면_지원한다() throws NoSuchMethodException {
        assertThat(resolver.supportsParameter(methodParameter("withAnnotation", Long.class))).isTrue();
    }

    @Test
    void 어노테이션이_없으면_지원하지_않는다() throws NoSuchMethodException {
        assertThat(resolver.supportsParameter(methodParameter("withoutAnnotation", Long.class))).isFalse();
    }

    @Test
    void 어노테이션이_있어도_Long_타입이_아니면_지원하지_않는다() throws NoSuchMethodException {
        assertThat(resolver.supportsParameter(methodParameter("wrongType", Member.class))).isFalse();
    }

    @Test
    void 액세스_토큰의_회원_식별자를_돌려준다() throws NoSuchMethodException {
        // given
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader(HttpHeaders.AUTHORIZATION, "Bearer " + jwtTokenProvider.createAccessToken(7L).value());

        // when
        Long memberId = resolver.resolveArgument(
                methodParameter("withAnnotation", Long.class), null, new ServletWebRequest(request), null);

        // then
        assertThat(memberId).isEqualTo(7L);
    }

    @Test
    void 토큰이_없으면_로그인_필요_예외가_발생한다() throws NoSuchMethodException {
        // given
        MethodParameter parameter = methodParameter("withAnnotation", Long.class);

        // when & then
        assertThatThrownBy(() -> resolver.resolveArgument(
                parameter, null, new ServletWebRequest(new MockHttpServletRequest()), null))
                .isInstanceOf(AuthException.class)
                .extracting("errorCode")
                .isEqualTo(AuthErrorCode.AUTHENTICATION_REQUIRED);
    }

    private static MethodParameter methodParameter(
            String methodName,
            Class<?> parameterType
    ) throws NoSuchMethodException {
        Method method = Fixtures.class.getDeclaredMethod(methodName, parameterType);
        return new MethodParameter(method, 0);
    }

    @SuppressWarnings("unused")
    private static class Fixtures {

        void withAnnotation(@LoginMember Long memberId) {
        }

        void withoutAnnotation(Long memberId) {
        }

        void wrongType(@LoginMember Member member) {
        }
    }
}
