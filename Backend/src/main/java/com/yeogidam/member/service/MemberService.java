package com.yeogidam.member.service;

import com.yeogidam.member.domain.Nickname;
import com.yeogidam.member.domain.Member;
import com.yeogidam.member.dto.request.MemberCreateRequest;
import com.yeogidam.member.dto.response.MemberResponse;
import com.yeogidam.member.exception.MemberNotFoundException;
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
        return new MemberResponse(memberId, member.nickname().value());
    }

    public void validateExists(Long memberId) {
        memberDao.findById(memberId)
                .orElseThrow(MemberNotFoundException::new);
    }
}
