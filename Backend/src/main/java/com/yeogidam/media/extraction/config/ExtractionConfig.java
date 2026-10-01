package com.yeogidam.media.extraction.config;

import java.net.http.HttpClient;
import java.time.Duration;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.web.client.RestClient;

@Configuration
@EnableConfigurationProperties({ExtractionProperties.class, GeminiProperties.class, KakaoLocalProperties.class})
public class ExtractionConfig {

    private static final Duration GEMINI_HTTP_TIMEOUT = Duration.ofSeconds(20);
    private static final Duration KAKAO_LOCAL_HTTP_TIMEOUT = Duration.ofSeconds(5);

    /*
    TODO: 부하테스트 한 후 재설정하기
     */
    @Bean
    public ThreadPoolTaskExecutor mediaExtractionExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(2);
        executor.setMaxPoolSize(4);
        executor.setQueueCapacity(100);
        executor.setThreadNamePrefix("media-extraction-");
        executor.setWaitForTasksToCompleteOnShutdown(true);
        return executor;
    }

    @Bean("geminiRestClient")
    public RestClient geminiRestClient(RestClient.Builder builder) {
        return builder.requestFactory(createRequestFactory(GEMINI_HTTP_TIMEOUT))
                .build();
    }

    @Bean("kakaoLocalRestClient")
    public RestClient kakaoLocalRestClient(RestClient.Builder builder) {
        return builder.requestFactory(createRequestFactory(KAKAO_LOCAL_HTTP_TIMEOUT))
                .build();
    }

    private JdkClientHttpRequestFactory createRequestFactory(Duration timeout) {
        HttpClient httpClient = HttpClient.newBuilder()
                .connectTimeout(timeout)
                .build();
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(httpClient);
        requestFactory.setReadTimeout(timeout);
        return requestFactory;
    }
}
