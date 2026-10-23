package com.yeogidam.global.logging;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import jakarta.servlet.FilterChain;
import java.util.concurrent.atomic.AtomicReference;
import java.util.stream.Stream;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.slf4j.MDC;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

/**
 * 필터는 서블릿 인프라 컴포넌트라 스프링 컨텍스트 없이 직접 호출로 검증한다.
 * 실제 JSON 로그 모양은 dev 프로필에서 눈으로 확인한다.
 */
class RequestLoggingFilterTest {

    /**
     * 헤더 이름과 MDC 키는 클라이언트 문의와 CloudWatch 조회식이 묶이는 바깥 계약이라,
     * 필터의 상수를 참조하지 않고 리터럴로 고정해 값이 바뀌면 테스트가 깨지게 한다.
     */
    private static final String HEADER_NAME = "X-Request-Id";
    private static final String MDC_REQUEST_ID = "requestId";
    private static final int MAX_LENGTH = 64;
    private static final String API_PATH = "/api/v1/saved-places";

    private final RequestLoggingFilter filter = new RequestLoggingFilter();

    /**
     * 필터가 MDC를 비우지 못한 채 실패하면 다음 테스트가 영향을 받으므로 매번 정리한다.
     */
    @AfterEach
    void clearMdc() {
        MDC.clear();
    }

    @Test
    void 헤더가_없으면_32자_requestId를_만들어_MDC와_응답_헤더에_넣고_끝나면_MDC를_비운다() throws Exception {
        // given
        MockHttpServletRequest request = new MockHttpServletRequest("GET", API_PATH);
        MockHttpServletResponse response = new MockHttpServletResponse();
        AtomicReference<String> requestIdInChain = new AtomicReference<>();
        FilterChain chain = (servletRequest, servletResponse) -> requestIdInChain.set(MDC.get(MDC_REQUEST_ID));

        // when
        filter.doFilter(request, response, chain);

        // then
        assertThat(requestIdInChain.get()).hasSize(32).matches("[0-9a-f]{32}");
        assertThat(response.getHeader(HEADER_NAME)).isEqualTo(requestIdInChain.get());
        assertThat(MDC.getCopyOfContextMap()).isNullOrEmpty();
    }

    @Test
    void 유효한_X_Request_Id_헤더가_오면_그대로_쓴다() throws Exception {
        // given
        MockHttpServletRequest request = new MockHttpServletRequest("GET", API_PATH);
        request.addHeader(HEADER_NAME, "nginx-Req-0001");
        MockHttpServletResponse response = new MockHttpServletResponse();
        AtomicReference<String> requestIdInChain = new AtomicReference<>();
        FilterChain chain = (servletRequest, servletResponse) -> requestIdInChain.set(MDC.get(MDC_REQUEST_ID));

        // when
        filter.doFilter(request, response, chain);

        // then
        assertThat(requestIdInChain.get()).isEqualTo("nginx-Req-0001");
        assertThat(response.getHeader(HEADER_NAME)).isEqualTo("nginx-Req-0001");
    }

    @ParameterizedTest
    @MethodSource("invalidRequestIds")
    void 허용_형식이_아닌_X_Request_Id_헤더는_버리고_새로_만든다(String header) throws Exception {
        // given
        MockHttpServletRequest request = new MockHttpServletRequest("GET", API_PATH);
        request.addHeader(HEADER_NAME, header);
        MockHttpServletResponse response = new MockHttpServletResponse();
        AtomicReference<String> requestIdInChain = new AtomicReference<>();
        FilterChain chain = (servletRequest, servletResponse) -> requestIdInChain.set(MDC.get(MDC_REQUEST_ID));

        // when
        filter.doFilter(request, response, chain);

        // then
        assertThat(requestIdInChain.get()).isNotEqualTo(header).hasSize(32).matches("[0-9a-f]{32}");
        assertThat(response.getHeader(HEADER_NAME)).isEqualTo(requestIdInChain.get());
    }

    /**
     * 65자는 길이 상한을 넘고, 공백과 줄바꿈은 로그 한 줄을 위조할 수 있어 버려야 한다.
     */
    private static Stream<String> invalidRequestIds() {
        return Stream.of(
                "a".repeat(MAX_LENGTH + 1),
                "abc def",
                "abc\ndef",
                ""
        );
    }

    @Test
    void 액추에이터_경로는_필터를_거치지_않는다() {
        // given
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/actuator/health/liveness");

        // when & then
        assertThat(filter.shouldNotFilter(request)).isTrue();
        assertThat(filter.shouldNotFilter(new MockHttpServletRequest("GET", API_PATH))).isFalse();
    }

    @Test
    void 체인이_예외를_던져도_MDC를_비운다() {
        // given
        MockHttpServletRequest request = new MockHttpServletRequest("GET", API_PATH);
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = (servletRequest, servletResponse) -> {
            throw new IllegalStateException("핸들러 실패");
        };

        // when & then
        assertThatThrownBy(() -> filter.doFilter(request, response, chain))
                .isInstanceOf(IllegalStateException.class);
        assertThat(MDC.getCopyOfContextMap()).isNullOrEmpty();
    }
}
