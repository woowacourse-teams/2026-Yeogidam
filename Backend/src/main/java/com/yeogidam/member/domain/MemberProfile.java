package com.yeogidam.member.domain;

/**
 * 제공자에게서 받은 회원 프로필. 닉네임은 가입 때 정하고, 이메일과 프로필 이미지는 로그인할 때마다 제공자 값을 따른다.
 */
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

    /**
     * 닉네임이 비어 있을 때만 전달받은 닉네임으로 채운다.
     */
    public MemberProfile withNicknameIfAbsent(String nickname) {
        if (this.nickname != null) {
            return this;
        }
        return new MemberProfile(nickname, email, imageUrl);
    }

    /**
     * 다시 로그인할 때 제공자가 준 프로필로 갱신한다.
     * 닉네임은 가입 때 정한 값을 그대로 두고, 이메일과 프로필 이미지는 제공자의 최신 값을 따른다.
     * 닉네임이 비어 있던 기존 회원만 제공자가 준 닉네임으로 채운다.
     */
    public MemberProfile updatedBy(MemberProfile provided) {
        return new MemberProfile(nickname, provided.email, provided.imageUrl)
                .withNicknameIfAbsent(provided.nickname);
    }
}
