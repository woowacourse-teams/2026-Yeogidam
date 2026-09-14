package com.yeogidam.auth.config;

import com.nimbusds.jose.jwk.source.ImmutableSecret;
import com.yeogidam.auth.domain.oauth.OAuthClient;
import com.yeogidam.auth.domain.oauth.OAuthClients;
import java.net.http.HttpClient;
import java.time.Clock;
import java.time.Duration;
import java.util.Base64;
import java.util.List;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtIssuerValidator;
import org.springframework.security.oauth2.jwt.JwtTimestampValidator;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestOperations;
import org.springframework.web.client.RestTemplate;

@Configuration
@EnableConfigurationProperties(JwtProperties.class)
public class AuthConfig {

    private static final int MINIMUM_KEY_BYTES = 32;
    private static final Duration HTTP_TIMEOUT = Duration.ofSeconds(5);

    @Bean
    public Clock clock() {
        return Clock.systemUTC();
    }

    @Bean
    public OAuthClients oauthClients(List<OAuthClient> clients) {
        return new OAuthClients(clients);
    }

    @Bean
    public SecretKey jwtSigningKey(JwtProperties properties) {
        byte[] key = Base64.getDecoder()
                .decode(properties.secret());
        if (key.length < MINIMUM_KEY_BYTES) {
            throw new IllegalArgumentException("JWT 서명 키는 Base64 인코딩 전 32바이트 이상이어야 합니다.");
        }
        return new SecretKeySpec(key, "HmacSHA256");
    }

    @Bean
    public JwtEncoder jwtEncoder(SecretKey jwtSigningKey) {
        return new NimbusJwtEncoder(new ImmutableSecret<>(jwtSigningKey));
    }

    @Bean
    public JwtDecoder jwtDecoder(SecretKey jwtSigningKey, JwtProperties properties, Clock clock) {
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withSecretKey(jwtSigningKey)
                .macAlgorithm(MacAlgorithm.HS256)
                .build();
        JwtTimestampValidator timestampValidator = new JwtTimestampValidator(Duration.ZERO);
        timestampValidator.setClock(clock);
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(timestampValidator,
                new JwtIssuerValidator(properties.issuer())));
        return decoder;
    }

    @Bean
    public RestClient oauthRestClient(RestClient.Builder builder) {
        return builder.requestFactory(createRequestFactory())
                .build();
    }

    @Bean
    public RestOperations oauthJwkRestOperations() {
        return new RestTemplate(createRequestFactory());
    }

    private JdkClientHttpRequestFactory createRequestFactory() {
        HttpClient httpClient = HttpClient.newBuilder()
                .connectTimeout(HTTP_TIMEOUT)
                .build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(httpClient);
        factory.setReadTimeout(HTTP_TIMEOUT);
        return factory;
    }
}
