package com.yeogidam.member.domain;

public record MemberProfile(
        String nickname,
        String email,
        String imageUrl
) {
    public MemberProfile {
        nickname = normalize(nickname);
        email = normalize(email);
        imageUrl = normalize(imageUrl);
    }

    private String normalize(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.strip();
    }
}
