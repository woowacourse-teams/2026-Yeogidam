package com.yeogidam.auth.domain.session;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import lombok.Getter;

@Getter
public class RefreshSession {

    private final Long id;
    private final String sessionId;
    private final Long memberId;
    private final String tokenHash;
    private final Instant expiresAt;
    private final boolean revoked;

    public RefreshSession(String sessionId, Long memberId, String tokenHash, Instant expiresAt, boolean revoked) {
        this(null, sessionId, memberId, tokenHash, expiresAt, revoked);
    }

    public RefreshSession(Long id, String sessionId, Long memberId, String tokenHash, Instant expiresAt,
                          boolean revoked) {
        this.id = id;
        this.sessionId = sessionId;
        this.memberId = memberId;
        this.tokenHash = tokenHash;
        this.expiresAt = expiresAt;
        this.revoked = revoked;
    }

    public boolean canRefresh(Long memberId, Instant now) {
        if (revoked) {
            return false;
        }
        if (this.memberId.equals(memberId)) {
            return expiresAt.isAfter(now);
        }
        return false;
    }

    public boolean isOwnedBy(Long memberId) {
        return this.memberId.equals(memberId);
    }

    public boolean isTokenMismatch(String tokenHash) {
        return !matchesToken(tokenHash);
    }

    private boolean matchesToken(String tokenHash) {
        return MessageDigest.isEqual(
                this.tokenHash.getBytes(StandardCharsets.UTF_8),
                tokenHash.getBytes(StandardCharsets.UTF_8));
    }

    public RefreshSession rotate(String tokenHash) {
        return new RefreshSession(id, sessionId, memberId, tokenHash, expiresAt, revoked);
    }

    public RefreshSession revoke() {
        return new RefreshSession(id, sessionId, memberId, tokenHash, expiresAt, true);
    }
}
