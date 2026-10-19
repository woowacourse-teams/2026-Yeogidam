package com.yeogidam.support;

/**
 * E2E 로그인 헬퍼가 돌려주는 값. 이후 요청의 인증 헤더와 회원 식별 검증에 쓴다.
 */
public record LoginResult(
        Long memberId,
        String accessToken,
        String refreshToken
) {
}
