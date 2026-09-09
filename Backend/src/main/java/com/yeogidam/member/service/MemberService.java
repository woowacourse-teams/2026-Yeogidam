package com.yeogidam.member.service;

import com.yeogidam.member.domain.Nickname;
import com.yeogidam.member.domain.Member;
import com.yeogidam.member.dto.request.MemberCreateRequest;
import com.yeogidam.member.dto.response.MemberResponse;
import com.yeogidam.member.exception.MemberErrorCode;
import com.yeogidam.member.exception.MemberException;
import com.yeogidam.member.repository.MemberDao;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class MemberService {

    private final MemberDao memberDao;

    public MemberService(MemberDao memberDao) {
        this.memberDao = memberDao;
    }

    @Transactional
    public MemberResponse createMember(MemberCreateRequest request) {
        Member member = new Member(null, new Nickname(request.nickname()));
        Long memberId = memberDao.insert(member.nickname().value());
        return MemberResponse.from(memberId, member);
    }

    public void validateExists(Long memberId) {
        memberDao.findById(memberId)
                .orElseThrow(() -> new MemberException(MemberErrorCode.NOT_FOUND));
    }
}
