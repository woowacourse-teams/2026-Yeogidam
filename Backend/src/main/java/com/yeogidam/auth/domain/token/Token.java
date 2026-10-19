package com.yeogidam.auth.domain.token;

import java.time.Instant;

public record Token(
        String value,
        Instant expiresAt
) {
}
