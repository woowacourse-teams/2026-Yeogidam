package com.yeogidam.auth.interceptor;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Optional;
import org.springframework.http.HttpHeaders;

/**
 * Authorization 헤더의 Bearer 액세스 토큰을 꺼낸다. 인터셉터와 리졸버가 같은 규칙으로 읽도록 한 곳에 둔다.
 */
public final class TokenExtractor {

    private static final String BEARER_PREFIX = "Bearer ";

    private TokenExtractor() {
    }

    public static Optional<String> extract(HttpServletRequest request) {
        String header = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (header == null || !header.startsWith(BEARER_PREFIX)) {
            return Optional.empty();
        }
        String token = header.substring(BEARER_PREFIX.length()).strip();
        if (token.isEmpty()) {
            return Optional.empty();
        }
        return Optional.of(token);
    }
}
