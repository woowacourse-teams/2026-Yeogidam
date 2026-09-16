package com.yeogidam.member.service;

import com.yeogidam.member.domain.Member;
import com.yeogidam.member.dto.response.MemberResponse;
import com.yeogidam.member.exception.MemberErrorCode;
import com.yeogidam.member.exception.MemberException;
import com.yeogidam.member.repository.MemberDao;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class MemberService {

    private final MemberDao memberDao;

    public MemberResponse readMember(Long memberId) {
        Member member = memberDao.findById(memberId)
                .orElseThrow(() -> new MemberException(MemberErrorCode.NOT_FOUND));
        return new MemberResponse(member);
    }
}
