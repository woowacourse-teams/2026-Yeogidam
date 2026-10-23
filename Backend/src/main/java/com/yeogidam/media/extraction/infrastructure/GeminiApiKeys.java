package com.yeogidam.media.extraction.infrastructure;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Gemini key를 부를 순서대로 들고, 한도나 결제 문제로 막힌 key는 정해진 시각까지 건너뛴다.
 * 무료 key를 앞에, 결제 key를 뒤에 두면 무료 key가 막힌 동안에만 결제 key가 요청을 받는다.
 */
class GeminiApiKeys {

    private final List<String> keysInOrder;
    private final Clock clock;
    private final Map<String, Instant> blockedUntil = new ConcurrentHashMap<>();

    GeminiApiKeys(List<String> keysInOrder, Clock clock) {
        this.keysInOrder = List.copyOf(keysInOrder);
        this.clock = clock;
    }

    /** 지금 부를 수 있는 key를 순서대로 돌려준다. 모두 막혀 있으면 빈 목록이다. */
    List<String> usable() {
        Instant now = clock.instant();
        return keysInOrder.stream()
                .filter(key -> !blockedUntil.getOrDefault(key, Instant.MIN).isAfter(now))
                .toList();
    }

    void block(String key, Duration duration) {
        blockedUntil.put(key, clock.instant().plus(duration));
    }

    /** 로그에 key 대신 남기는 순번이다. 1번이 먼저 부르는 key다. */
    int numberOf(String key) {
        return keysInOrder.indexOf(key) + 1;
    }
}
