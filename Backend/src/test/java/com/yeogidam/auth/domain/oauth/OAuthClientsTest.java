package com.yeogidam.auth.domain.oauth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.yeogidam.member.domain.OAuthProvider;
import com.yeogidam.support.fake.FakeOAuthClient;
import java.util.List;
import org.junit.jupiter.api.Test;

class OAuthClientsTest {

    private final FakeOAuthClient kakao = new FakeOAuthClient(OAuthProvider.KAKAO);
    private final FakeOAuthClient google = new FakeOAuthClient(OAuthProvider.GOOGLE);

    @Test
    void 제공자에_맞는_클라이언트를_돌려준다() {
        // given
        OAuthClients clients = new OAuthClients(List.of(kakao, google));

        // when & then
        assertThat(clients.get(OAuthProvider.GOOGLE)).isSameAs(google);
    }

    @Test
    void 등록되지_않은_제공자면_예외가_발생한다() {
        // given
        OAuthClients clients = new OAuthClients(List.of(kakao));

        // when & then
        assertThatThrownBy(() -> clients.get(OAuthProvider.APPLE))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 같은_제공자의_클라이언트가_둘이면_예외가_발생한다() {
        assertThatThrownBy(() -> new OAuthClients(List.of(kakao, new FakeOAuthClient(OAuthProvider.KAKAO))))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
