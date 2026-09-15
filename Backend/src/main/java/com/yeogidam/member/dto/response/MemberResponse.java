package com.yeogidam.member.dto.response;

import com.yeogidam.member.domain.Member;
import com.yeogidam.member.domain.OAuthProvider;

public record MemberResponse(
        Long id,
        String nickname,
        String email,
        String imageUrl,
        OAuthProvider oauthProvider
) {
    public MemberResponse(Member member) {
        this(
                member.id(),
                member.nickname(),
                member.profile()
                        .email(),
                member.profile()
                        .imageUrl(),
                member.oauthAccount()
                        .provider()
        );
    }
}
