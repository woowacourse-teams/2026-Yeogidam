package com.yeogidam.auth.service;

import com.yeogidam.auth.domain.session.RotatedRefreshToken;
import java.time.Clock;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * 세션마다 방금 교체된 리프레시 토큰을 서버 메모리에 기억한다. 유예 규칙은 RotatedRefreshToken이 든다.
 * 앱과 공유 확장이 같은 토큰으로 거의 동시에 재발급하면 뒤의 요청은 교체된 토큰을 보내게 되는데, 유예 안이면 TokenManager가
 * 세션을 폐기하지 않는다. 교체 기록은 세션 행을 FOR UPDATE로 잠근 트랜잭션이 커밋하기 전에 남기므로, 잠금을 기다리던 요청은
 * 교체 기록을 보고 판정한다. 서버가 하나라는 전제이고, 재기동하면 기록이 비어 유예 없이 판정한다.
 */
@Component
@RequiredArgsConstructor
public class RotatedRefreshTokens {

    private final Map<String, RotatedRefreshToken> rotatedTokens = new ConcurrentHashMap<>();
    private final Clock clock;

    public void record(String sessionId, String tokenHash) {
        Instant now = clock.instant();
        rotatedTokens.values().removeIf(rotatedToken -> rotatedToken.isExpired(now));
        rotatedTokens.put(sessionId, new RotatedRefreshToken(tokenHash, now));
    }

    public boolean isInGracePeriod(String sessionId, String tokenHash) {
        RotatedRefreshToken rotatedToken = rotatedTokens.get(sessionId);
        if (rotatedToken == null) {
            return false;
        }
        return rotatedToken.isInGrace(tokenHash, clock.instant());
    }
}
