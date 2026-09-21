package com.yeogidam.support.fake;

import com.yeogidam.auth.domain.oauth.OAuthClients;
import com.yeogidam.member.domain.OAuthProvider;
import java.util.List;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

/**
 * E2E 컨텍스트에서 실제 제공자 클라이언트 묶음 대신 FakeOAuthClient 묶음을 쓰게 한다.
 */
@TestConfiguration
public class FakeOAuthClientConfig {

    @Bean
    @Primary
    public OAuthClients fakeOAuthClients() {
        return new OAuthClients(List.of(
                new FakeOAuthClient(OAuthProvider.KAKAO),
                new FakeOAuthClient(OAuthProvider.GOOGLE),
                new FakeOAuthClient(OAuthProvider.APPLE)));
    }
}
