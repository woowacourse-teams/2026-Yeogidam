package com.yeogidam.global.logging;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Duration;
import java.util.UUID;
import java.util.regex.Pattern;
import lombok.extern.slf4j.Slf4j;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * 요청마다 requestId를 정해 MDC에 넣고, 요청이 끝나면 메서드, 경로, 상태 코드, 소요 시간을 한 줄로 남긴다.
 * dev와 prod는 로그가 JSON이라 MDC 항목이 최상위 키로 들어가고, CloudWatch에서 요청 하나가 어떤 상태 코드로
 * 몇 ms 만에 끝났는지 볼 수 있다.
 * <p>
 * 가장 바깥에서 돌아야 전체 소요 시간을 재고, 뒤에 오는 인터셉터와 핸들러의 로그에도 requestId가 붙는다.
 * 경로는 request.getRequestURI()만 남긴다. 쿼리스트링, 헤더, 본문에는 개인정보와 토큰이 섞일 수 있고,
 * 클라이언트 IP는 nginx access 로그에 이미 있다.
 */
@Slf4j
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestLoggingFilter extends OncePerRequestFilter {

    private static final String HEADER_NAME = "X-Request-Id";
    private static final int MAX_LENGTH = 64;
    /**
     * 클라이언트가 보낸 값을 그대로 로그에 넣으므로 글자, 숫자, 하이픈만 허용한다.
     * 공백이나 줄바꿈이 들어오면 로그 한 줄을 위조하거나 JSON을 깨뜨릴 수 있다.
     */
    private static final Pattern ALLOWED_PATTERN = Pattern.compile("[A-Za-z0-9-]{1," + MAX_LENGTH + "}");

    private static final String MDC_REQUEST_ID = "requestId";
    private static final String MDC_HTTP_METHOD = "httpMethod";
    private static final String MDC_PATH = "path";
    private static final String MDC_STATUS = "status";
    private static final String MDC_DURATION_MS = "durationMs";

    /**
     * 도커 헬스체크가 30초마다 찍혀서 로그와 비용만 늘리므로 액추에이터 경로는 남기지 않는다.
     */
    private static final String ACTUATOR_PATH_PREFIX = "/actuator";

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return request.getRequestURI().startsWith(ACTUATOR_PATH_PREFIX);
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        String requestId = resolveRequestId(request);
        // 클라이언트가 문의할 때 requestId를 알려줄 수 있도록 응답에도 돌려준다.
        response.setHeader(HEADER_NAME, requestId);
        MDC.put(MDC_REQUEST_ID, requestId);
        long startedAt = System.nanoTime();
        try {
            filterChain.doFilter(request, response);
        } finally {
            // 체인이 예외를 던져도 여기까지 온다. 요청 한 줄은 항상 남기고, MDC는 반드시 비운다.
            long elapsedMs = Duration.ofNanos(System.nanoTime() - startedAt).toMillis();
            String method = request.getMethod();
            String path = request.getRequestURI();
            int status = response.getStatus();
            MDC.put(MDC_HTTP_METHOD, method);
            MDC.put(MDC_PATH, path);
            // MDC는 값이 문자열이라 status와 durationMs가 JSON에도 "200", "14"처럼 문자열로 실린다.
            // CloudWatch 지표 필터에서 이 두 키를 걸 때는 { $.status = "500" }처럼 문자열로 비교해야 맞는다.
            MDC.put(MDC_STATUS, String.valueOf(status));
            MDC.put(MDC_DURATION_MS, String.valueOf(elapsedMs));
            log.info("[요청] {} {} {} {}ms", method, path, status, elapsedMs);
            // 톰캣 스레드가 재사용되므로 비우지 않으면 다음 요청 로그에 이번 값이 샌다.
            MDC.clear();
        }
    }

    /**
     * X-Request-Id 헤더가 허용 형식이면 그 값을 쓰고, 없거나 형식에 어긋나면 새로 만든다.
     * 서버에서는 nginx(Infra/nginx/nginx.conf.template)가 요청마다 만든 $request_id(32자 16진수)를 이 헤더로
     * 넘기고 access 로그에도 같은 값을 남기므로, 값은 nginx가 정하고 클라이언트가 보낸 값은 nginx에서 덮인다.
     * 로컬 실행처럼 nginx가 없으면 클라이언트 값이나 여기서 만든 값이 쓰이므로 형식 검사는 그대로 둔다.
     */
    private String resolveRequestId(HttpServletRequest request) {
        String header = request.getHeader(HEADER_NAME);
        if (header != null && ALLOWED_PATTERN.matcher(header).matches()) {
            return header;
        }
        return UUID.randomUUID().toString().replace("-", "");
    }
}
