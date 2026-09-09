package com.yeogidam.member.dto.response;

import com.yeogidam.member.domain.Member;

public record MemberResponse(
        Long id,
        String nickname
) {

    public static MemberResponse from(
            Long memberId,
            Member member
    ) {
        return new MemberResponse(memberId, member.nickname().value());
    }
}
