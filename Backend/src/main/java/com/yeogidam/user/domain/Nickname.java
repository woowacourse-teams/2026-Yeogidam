package com.yeogidam.user.domain;

public record Nickname(
        String value
) {

    public Nickname {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("닉네임이 비어 있습니다.");
        }
    }
}
