package com.yeogidam.member.domain;

/**
 * 소셜 계정으로 회원을 찾거나 가입시킨 결과를 담는다. 이번 요청에서 회원을 새로 저장했을 때만 새 회원으로 본다.
 */
public record MemberAuthentication(
        Member member,
        boolean isNewMember
) {
}
