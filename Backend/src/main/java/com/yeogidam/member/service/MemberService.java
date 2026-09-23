package com.yeogidam.member.service;

import com.yeogidam.auth.domain.oauth.OAuthClient;
import com.yeogidam.auth.domain.oauth.OAuthClients;
import com.yeogidam.member.domain.Member;
import com.yeogidam.member.dto.response.MemberResponse;
import com.yeogidam.member.exception.MemberErrorCode;
import com.yeogidam.member.exception.MemberException;
import com.yeogidam.member.repository.MemberDao;
import lombok.RequiredArgsConstructor;
import org.jspecify.annotations.NonNull;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class MemberService {

    private final MemberDao memberDao;
    private final OAuthClients oauthClients;

    public MemberResponse readMember(Long memberId) {
        Member member = getMember(memberId);
        return new MemberResponse(member);
    }

    @Transactional
    public void deleteMember(Long memberId, String authorizationCode) {
        Member member = getMember(memberId);
        OAuthClient oauthClient = oauthClients.get(member.oauthAccount().provider());
        oauthClient.deleteAccount(authorizationCode, member.oauthAccount());
        memberDao.deleteById(memberId); // media, places, media_places 제외 회원 소유 데이터 삭제
    }

    private Member getMember(Long memberId) {
        return memberDao.findById(memberId)
                .orElseThrow(() -> new MemberException(MemberErrorCode.NOT_FOUND));
    }
}
