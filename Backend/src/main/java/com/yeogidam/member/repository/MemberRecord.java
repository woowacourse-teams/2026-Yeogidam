package com.yeogidam.member.repository;

import java.time.LocalDateTime;

public record MemberRecord(
        Long id,
        String nickname,
        String oauthProvider,
        String oauthProviderUserId,
        LocalDateTime createdAt
) {
}
