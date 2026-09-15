package com.yeogidam.auth.domain.oauth;

import com.yeogidam.member.domain.OAuthProvider;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

public class OAuthClients {

    private final Map<OAuthProvider, OAuthClient> clients;

    public OAuthClients(List<OAuthClient> clients) {
        this.clients = new EnumMap<>(OAuthProvider.class);
        clients.forEach(this::register);
    }

    private void register(OAuthClient client) {
        if (clients.putIfAbsent(client.getProvider(), client) != null) {
            throw new IllegalArgumentException("같은 제공자의 OAuth 클라이언트가 중복되었습니다.");
        }
    }

    public OAuthClient get(OAuthProvider provider) {
        OAuthClient client = clients.get(provider);
        if (client == null) {
            throw new IllegalArgumentException("해당 제공자의 OAuth 클라이언트가 등록되지 않았습니다.");
        }
        return client;
    }
}
