package com.yeogidam.auth.service;

import static com.yeogidam.support.MemberFixture.kakaoMember;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertAll;

import com.yeogidam.auth.domain.session.RefreshSession;
import com.yeogidam.auth.dto.request.RefreshTokenRequest;
import com.yeogidam.auth.dto.response.TokenResponse;
import com.yeogidam.auth.exception.AuthErrorCode;
import com.yeogidam.auth.exception.AuthException;
import com.yeogidam.auth.exception.RefreshTokenMismatchException;
import com.yeogidam.auth.infrastructure.jwt.JwtTokenProvider;
import com.yeogidam.auth.repository.RefreshSessionRepository;
import com.yeogidam.member.repository.MemberRepository;
import com.yeogidam.support.IntegrationTestSupport;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import org.assertj.core.api.ThrowableAssert.ThrowingCallable;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * 세션 저장소의 최종 상태(해시 저장, 회전 시 만료 유지, 재사용 시 폐기, 만료 세션 거부)를 검증한다.
 * HTTP로 드러나는 상태 코드와 에러코드는 AuthE2eTest가 맡는다.
 */
class TokenManagerTest extends IntegrationTestSupport {

    @Autowired
    private TokenManager tokenManager;

    @Autowired
    private JwtTokenProvider tokenProvider;

    @Autowired
    private RefreshSessionRepository refreshSessionRepository;

    @Autowired
    private MemberRepository memberRepository;

    private Long memberId;

    @BeforeEach
    void setUp() {
        memberId = memberRepository.save(kakaoMember("kakao-1")).id();
    }

    @Test
    void 발급하면_세션에_리프레시_토큰_원문이_아니라_해시를_저장한다() throws Exception {
        // when
        TokenResponse tokens = tokenManager.createTokens(memberId);

        // then
        RefreshSession session = sessionOf(tokens.refreshToken());
        String expectedHash = sha256(tokens.refreshToken());
        assertAll(
                () -> assertThat(session.getMemberId()).isEqualTo(memberId),
                () -> assertThat(session.getTokenHash()).isEqualTo(expectedHash),
                () -> assertThat(session.getExpiresAt()).isEqualTo(tokens.refreshTokenExpiresAt()),
                () -> assertThat(session.isRevoked()).isFalse()
        );
    }

    @Test
    void 회전하면_같은_세션의_해시만_바뀌고_최초_만료는_유지된다() throws Exception {
        // given
        TokenResponse issued = tokenManager.createTokens(memberId);

        // when
        TokenResponse rotated = tokenManager.createTokenRefresh(new RefreshTokenRequest(issued.refreshToken()));

        // then
        RefreshSession session = sessionOf(issued.refreshToken());
        String rotatedHash = sha256(rotated.refreshToken());
        assertAll(
                () -> assertThat(rotated.refreshToken()).isNotEqualTo(issued.refreshToken()),
                () -> assertThat(rotated.refreshTokenExpiresAt()).isEqualTo(issued.refreshTokenExpiresAt()),
                () -> assertThat(session.getTokenHash()).isEqualTo(rotatedHash),
                () -> assertThat(session.isRevoked()).isFalse()
        );
    }

    @Test
    void 회전_전_토큰을_다시_쓰면_세션을_폐기한다() {
        // given
        TokenResponse issued = tokenManager.createTokens(memberId);
        tokenManager.createTokenRefresh(new RefreshTokenRequest(issued.refreshToken()));

        // when
        assertThatThrownBy(() -> tokenManager.createTokenRefresh(new RefreshTokenRequest(issued.refreshToken())))
                .isInstanceOf(RefreshTokenMismatchException.class);

        // then
        assertThat(sessionOf(issued.refreshToken()).isRevoked()).isTrue();
    }

    @Test
    void 만료된_세션은_JWT가_유효해도_회전하지_못한다() {
        // given
        Instant pastExpiry = Instant.now().minus(Duration.ofDays(1));
        refreshSessionRepository.save(new RefreshSession("expired-session", memberId, "hash", pastExpiry, false));
        String stillValidJwt = tokenProvider.reissueRefreshToken(
                memberId, "expired-session", Instant.now().plus(Duration.ofDays(1))).value();

        // when & then
        assertInvalidToken(() -> tokenManager.createTokenRefresh(new RefreshTokenRequest(stillValidJwt)));
    }

    @Test
    void 세션의_회원과_토큰의_회원이_다르면_회전하지_못한다() {
        // given
        TokenResponse issued = tokenManager.createTokens(memberId);
        String sessionId = tokenProvider.parseRefreshToken(issued.refreshToken()).sessionId();
        Long otherMemberId = memberRepository.save(kakaoMember("kakao-2")).id();
        String otherMembersJwt = tokenProvider.reissueRefreshToken(
                otherMemberId, sessionId, issued.refreshTokenExpiresAt()).value();

        // when & then
        assertInvalidToken(() -> tokenManager.createTokenRefresh(new RefreshTokenRequest(otherMembersJwt)));
    }

    @Test
    void 로그아웃하면_그_세션만_폐기되고_다른_세션은_남는다() {
        // given
        TokenResponse phone = tokenManager.createTokens(memberId);
        TokenResponse tablet = tokenManager.createTokens(memberId);

        // when
        tokenManager.revokeRefreshSession(new RefreshTokenRequest(phone.refreshToken()));

        // then
        assertAll(
                () -> assertThat(sessionOf(phone.refreshToken()).isRevoked()).isTrue(),
                () -> assertThat(sessionOf(tablet.refreshToken()).isRevoked()).isFalse()
        );
    }

    private RefreshSession sessionOf(String refreshToken) {
        String sessionId = tokenProvider.parseRefreshToken(refreshToken).sessionId();
        return refreshSessionRepository.findBySessionId(sessionId).orElseThrow();
    }

    private static String sha256(String value) throws Exception {
        byte[] hash = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
        return HexFormat.of().formatHex(hash);
    }

    private static void assertInvalidToken(ThrowingCallable callable) {
        assertThatThrownBy(callable)
                .isInstanceOf(AuthException.class)
                .extracting("errorCode")
                .isEqualTo(AuthErrorCode.INVALID_TOKEN);
    }
}
