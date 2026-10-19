package com.yeogidam.auth.domain.token;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

@Getter
@RequiredArgsConstructor
public enum TokenType {

    ACCESS("access"),
    REFRESH("refresh"),
    OAUTH_STATE("oauth_state");

    private final String value;
}
