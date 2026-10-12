package com.yeogidam.member.service;

import com.yeogidam.member.domain.Member;
import com.yeogidam.member.domain.MemberProfile;
import com.yeogidam.member.domain.OAuthAccount;
import com.yeogidam.member.repository.MemberDao;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class MemberAuthenticator {

    private final MemberDao memberDao;
    private final RandomNicknameGenerator randomNicknameGenerator;

    /**
     * 제공자가 닉네임을 주지 않으면 랜덤 닉네임으로 가입시킨다. 이미 가입한 회원은 닉네임을 바꾸지 않는다.
     */
    @Transactional
    public Member authenticate(OAuthAccount account, MemberProfile profile) {
        MemberProfile profileWithNickname = profile.withNicknameIfAbsent(randomNicknameGenerator.generate());
        Optional<Member> existingMember = memberDao.findByOAuthAccount(account);
        if (existingMember.isPresent()) {
            return updateExistingMember(account, profileWithNickname);
        }

        try {
            return memberDao.save(new Member(profileWithNickname, account));
        } catch (DuplicateKeyException exception) {
            return updateExistingMember(account, profileWithNickname);
        }
    }

    private Member updateExistingMember(OAuthAccount account, MemberProfile profile) {
        Member member = memberDao.findByOAuthAccountForUpdate(account)
                .orElseThrow(() -> new IllegalStateException("회원을 찾을 수 없습니다."));
        member.updateProfile(profile);
        memberDao.update(member);
        return member;
    }
}
