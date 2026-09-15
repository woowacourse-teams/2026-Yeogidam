package com.yeogidam.member.domain;

/**
 * OAuth 계정으로 식별하는 여기담 회원. 로그인 시 최신 프로필로 갱신한다.
 */
public class Member {

    private final Long id;
    private final OAuthAccount oauthAccount;
    private MemberProfile profile;

    public Member(MemberProfile profile, OAuthAccount oauthAccount) {
        this(null, profile, oauthAccount);
    }

    public Member(Long id, MemberProfile profile, OAuthAccount oauthAccount) {
        validate(profile, oauthAccount);
        this.id = id;
        this.profile = profile;
        this.oauthAccount = oauthAccount;
    }

    private void validate(MemberProfile profile, OAuthAccount oauthAccount) {
        if (profile == null) {
            throw new IllegalArgumentException("회원 프로필이 비어 있습니다.");
        }
        if (oauthAccount == null) {
            throw new IllegalArgumentException("OAuth 계정이 비어 있습니다.");
        }
    }

    public void updateProfile(MemberProfile profile) {
        validate(profile, oauthAccount);
        this.profile = profile;
    }

    public Long id() {
        return id;
    }

    public String nickname() {
        return profile.nickname();
    }

    public OAuthAccount oauthAccount() {
        return oauthAccount;
    }

    public MemberProfile profile() {
        return profile;
    }
}
