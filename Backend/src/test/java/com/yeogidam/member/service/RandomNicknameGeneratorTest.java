package com.yeogidam.member.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;

class RandomNicknameGeneratorTest {

    private final RandomNicknameGenerator randomNicknameGenerator = new RandomNicknameGenerator();

    @Test
    void 닉네임은_담이_뒤에_한_칸_띄우고_네_자리_숫자를_붙인다() {
        // when & then: 난수라서 여러 번 만들어 모두 같은 형식인지 본다
        IntStream.range(0, 100)
                .mapToObj(count -> randomNicknameGenerator.generate())
                .forEach(nickname -> assertThat(nickname).matches("담이 [1-9]\\d{3}"));
    }
}
