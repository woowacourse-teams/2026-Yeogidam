package com.yeogidam.support;

import com.yeogidam.member.domain.Member;
import com.yeogidam.member.domain.MemberProfile;
import com.yeogidam.member.domain.OAuthAccount;
import com.yeogidam.member.domain.OAuthProvider;

public final class MemberFixture {

    private MemberFixture() {
    }

    public static OAuthAccount kakaoAccount(String providerUserId) {
        return new OAuthAccount(OAuthProvider.KAKAO, providerUserId);
    }

    public static MemberProfile profile(String nickname) {
        return new MemberProfile(nickname, nickname + "@example.com", "https://img.example.com/" + nickname);
    }

    /**
     * 아직 저장되지 않은 카카오 회원. 닉네임은 제공자 사용자 식별자를 그대로 쓴다.
     */
    public static Member kakaoMember(String providerUserId) {
        return new Member(profile(providerUserId), kakaoAccount(providerUserId));
    }
}
