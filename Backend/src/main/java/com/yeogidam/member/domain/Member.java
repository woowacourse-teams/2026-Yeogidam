package com.yeogidam.member.domain;

/**
 * 여기담 사용자. 인증은 아직 없고(추후 여기담 로그인), 사용자 구분의 최소 단위로만 존재한다.
 */
public class Member {

    private final Long id;
    private final Nickname nickname;

    public Member(
            Long id,
            Nickname nickname
    ) {
        validate(nickname);
        this.id = id;
        this.nickname = nickname;
    }

    private void validate(Nickname nickname) {
        if (nickname == null) {
            throw new IllegalArgumentException("닉네임이 비어 있습니다.");
        }
    }

    public Long id() {
        return id;
    }

    public Nickname nickname() {
        return nickname;
    }
}
