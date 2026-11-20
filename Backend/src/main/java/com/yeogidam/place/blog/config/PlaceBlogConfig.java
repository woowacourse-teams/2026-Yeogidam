package com.yeogidam.place.blog.config;

import java.net.http.HttpClient;
import java.time.Duration;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

@Configuration
@EnableConfigurationProperties(NaverApiHubProperties.class)
public class PlaceBlogConfig {

    // 블로그 탭을 연 사용자가 네이버 응답을 기다리는 최대 시간. JDK HttpClient는 기본 타임아웃이 없어 빠지면 끝없이 기다린다.
    private static final Duration NAVER_API_HUB_HTTP_TIMEOUT = Duration.ofSeconds(3);

    @Bean("naverApiHubRestClient")
    public RestClient naverApiHubRestClient(RestClient.Builder builder) {
        HttpClient httpClient = HttpClient.newBuilder()
                .connectTimeout(NAVER_API_HUB_HTTP_TIMEOUT)
                .build();
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(httpClient);
        requestFactory.setReadTimeout(NAVER_API_HUB_HTTP_TIMEOUT);
        return builder.requestFactory(requestFactory)
                .build();
    }
}
