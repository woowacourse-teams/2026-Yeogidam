package com.yeogidam.member.service;

import com.yeogidam.member.domain.Member;
import com.yeogidam.member.domain.MemberProfile;
import com.yeogidam.member.domain.OAuthAccount;
import com.yeogidam.member.repository.MemberRepository;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class MemberAuthenticator {

    private final MemberRepository memberRepository;

    @Transactional
    public Member authenticate(OAuthAccount account, MemberProfile profile) {
        Optional<Member> existingMember = memberRepository.findByOAuthAccount(account);
        if (existingMember.isPresent()) {
            return updateExistingMember(account, profile);
        }

        try {
            return memberRepository.save(new Member(profile, account));
        } catch (DuplicateKeyException exception) {
            return updateExistingMember(account, profile);
        }
    }

    private Member updateExistingMember(OAuthAccount account, MemberProfile profile) {
        Member member = memberRepository.findByOAuthAccountForUpdate(account)
                .orElseThrow(() -> new IllegalStateException("회원을 찾을 수 없습니다."));
        member.updateProfile(profile);
        memberRepository.update(member);
        return member;
    }
}
