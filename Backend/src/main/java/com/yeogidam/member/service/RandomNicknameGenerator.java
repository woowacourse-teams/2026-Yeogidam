package com.yeogidam.member.service;

import java.util.concurrent.ThreadLocalRandom;
import org.springframework.stereotype.Component;

/**
 * 제공자가 닉네임을 주지 않은 회원에게 줄 기본 닉네임을 만든다. "담이" 뒤에 한 칸 띄우고 네 자리 숫자를 붙인다(예: 담이 3432).
 * 닉네임은 회원 식별자가 아니라서 다른 회원과 겹쳐도 된다.
 */
@Component
public class RandomNicknameGenerator {

    private static final String NICKNAME_FORMAT = "담이 %d";
    private static final int MIN_NUMBER = 1_000;
    private static final int MAX_NUMBER_EXCLUSIVE = 10_000;

    public String generate() {
        int number = ThreadLocalRandom.current().nextInt(MIN_NUMBER, MAX_NUMBER_EXCLUSIVE);
        return NICKNAME_FORMAT.formatted(number);
    }
}
