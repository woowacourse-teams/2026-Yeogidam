package com.yeogidam.media.extraction.config;

import java.net.http.HttpClient;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.web.client.RestClient;

@Configuration
@EnableConfigurationProperties({
        ExtractionProperties.class, ExtractionPoolProperties.class, GeminiProperties.class, KakaoLocalProperties.class,
        GooglePlacesProperties.class
})
public class ExtractionConfig {

    private static final Duration GEMINI_HTTP_TIMEOUT = Duration.ofSeconds(20);
    private static final Duration GEMINI_MEDIA_HTTP_TIMEOUT = Duration.ofSeconds(120);
    private static final Duration MEDIA_DOWNLOAD_HTTP_TIMEOUT = Duration.ofSeconds(30);
    private static final Duration KAKAO_LOCAL_HTTP_TIMEOUT = Duration.ofSeconds(5);
    private static final Duration GOOGLE_PLACES_HTTP_TIMEOUT = Duration.ofSeconds(5);

    @Bean
    public ThreadPoolTaskExecutor mediaExtractionExecutor(ExtractionPoolProperties properties) {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(properties.coreSize());
        executor.setMaxPoolSize(properties.maxSize());
        executor.setQueueCapacity(properties.queueCapacity());
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

    @Bean("googlePlacesRestClient")
    public RestClient googlePlacesRestClient(RestClient.Builder builder) {
        return builder.requestFactory(createRequestFactory(GOOGLE_PLACES_HTTP_TIMEOUT))
                .build();
    }

    @Bean
    public RestClient geminiMediaRestClient(
            RestClient.Builder builder,
            @Qualifier("geminiMediaHttpClient") HttpClient httpClient
    ) {
        return builder.requestFactory(createRequestFactory(httpClient, GEMINI_MEDIA_HTTP_TIMEOUT))
                .build();
    }

    @Bean
    public RestClient instagramMediaRestClient(
            RestClient.Builder builder,
            @Qualifier("instagramMediaHttpClient") HttpClient httpClient
    ) {
        return builder.requestFactory(createRequestFactory(httpClient, MEDIA_DOWNLOAD_HTTP_TIMEOUT))
                .build();
    }

    @Bean(defaultCandidate = false)
    public HttpClient geminiMediaHttpClient() {
        return createHttpClient(GEMINI_MEDIA_HTTP_TIMEOUT);
    }

    @Bean(defaultCandidate = false)
    public HttpClient instagramMediaHttpClient() {
        return createHttpClient(MEDIA_DOWNLOAD_HTTP_TIMEOUT);
    }

    private HttpClient createHttpClient(Duration timeout) {
        return HttpClient.newBuilder()
                .connectTimeout(timeout)
                .build();
    }

    private JdkClientHttpRequestFactory createRequestFactory(Duration timeout) {
        return createRequestFactory(createHttpClient(timeout), timeout);
    }

    private JdkClientHttpRequestFactory createRequestFactory(HttpClient httpClient, Duration timeout) {
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(httpClient);
        requestFactory.setReadTimeout(timeout);
        return requestFactory;
    }
}
