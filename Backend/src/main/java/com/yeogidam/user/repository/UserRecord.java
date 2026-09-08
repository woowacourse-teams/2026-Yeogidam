package com.yeogidam.user.repository;

import java.time.LocalDateTime;

public record UserRecord(
        Long id,
        String nickname,
        LocalDateTime createdAt
) {
}
