package com.yeogidam.auth.service;

import com.yeogidam.auth.config.oauth.GoogleProperties;
import com.yeogidam.auth.config.oauth.KakaoProperties;
import com.yeogidam.auth.config.oauth.OAuthProperties;
import com.yeogidam.auth.dto.response.AuthorizationUrlResponse;
import com.yeogidam.auth.infrastructure.jwt.JwtTokenProvider;
import com.yeogidam.member.domain.OAuthProvider;
import java.net.URI;
import java.util.Locale;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.web.util.UriComponentsBuilder;

@Service
@RequiredArgsConstructor
public class OAuthAuthorizationService {

    private final KakaoProperties kakaoProperties;
    private final GoogleProperties googleProperties;
    private final OAuthProperties oauthProperties;
    private final JwtTokenProvider jwtTokenProvider;

    public AuthorizationUrlResponse readKakaoAuthorizationUrl() {
        String state = jwtTokenProvider.createOAuthState();
        return new AuthorizationUrlResponse(kakaoProperties.createAuthorizationUrl(state));
    }

    public AuthorizationUrlResponse readGoogleAuthorizationUrl() {
        String state = jwtTokenProvider.createOAuthState();
        return new AuthorizationUrlResponse(googleProperties.createAuthorizationUrl(state));
    }

    /**
     * 제공자가 돌려준 인가 코드를 앱 콜백 주소에 실어 돌려준다. 사용자가 취소하는 등 제공자가 오류로 돌려보내면 코드 대신 오류를 싣는다.
     * 토큰은 만들지 않으며, 앱은 받은 코드로 POST /api/v1/auth/logins/{provider}를 부른다.
     */
    public URI readAppCallbackUri(
            OAuthProvider provider,
            String code,
            String state,
            String error
    ) {
        jwtTokenProvider.validateOAuthState(state);
        if (error != null) {
            return createAppCallbackUri(provider, "error", error);
        }
        return createAppCallbackUri(provider, "code", code);
    }

    private URI createAppCallbackUri(
            OAuthProvider provider,
            String name,
            String value
    ) {
        return UriComponentsBuilder.fromUriString(oauthProperties.appCallbackUri())
                .queryParam("provider", provider.name().toLowerCase(Locale.ROOT))
                .queryParam(name, value)
                .build()
                .encode()
                .toUri();
    }
}
