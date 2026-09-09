package com.yeogidam.member.domain;

/**
 * 여기담 사용자. 닉네임과 OAuth 계정 정체성을 든다.
 * 진짜 로그인(토큰 발급·검증)은 아직 없고, 사용자 구분과 인증 재료 보관까지만 맡는다.
 */
public class Member {

    private final Long id;
    private final Nickname nickname;
    private final OAuthAccount oauthAccount;

    public Member(
            Long id,
            Nickname nickname,
            OAuthAccount oauthAccount
    ) {
        validate(nickname, oauthAccount);
        this.id = id;
        this.nickname = nickname;
        this.oauthAccount = oauthAccount;
    }

    private void validate(Nickname nickname, OAuthAccount oauthAccount) {
        if (nickname == null) {
            throw new IllegalArgumentException("닉네임이 비어 있습니다.");
        }
        if (oauthAccount == null) {
            throw new IllegalArgumentException("OAuth 계정이 비어 있습니다.");
        }
    }

    public Long id() {
        return id;
    }

    public Nickname nickname() {
        return nickname;
    }

    public OAuthAccount oauthAccount() {
        return oauthAccount;
    }
}
