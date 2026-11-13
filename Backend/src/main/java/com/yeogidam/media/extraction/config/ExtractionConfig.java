package com.yeogidam.media.extraction.config;

import com.yeogidam.media.extraction.infrastructure.loadtest.LoadTestMetrics;
import com.yeogidam.media.extraction.logging.ExtractionTaskDecorator;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.task.TaskDecorator;
import org.springframework.core.task.support.CompositeTaskDecorator;
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
    public ThreadPoolTaskExecutor mediaExtractionExecutor(
            ExtractionPoolProperties properties,
            ObjectProvider<LoadTestMetrics> loadTestMetrics
    ) {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(properties.coreSize());
        executor.setMaxPoolSize(properties.maxSize());
        executor.setQueueCapacity(properties.queueCapacity());
        executor.setThreadNamePrefix("media-extraction-");
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setTaskDecorator(taskDecorator(executor, loadTestMetrics));
        return executor;
    }

    // 실행기는 데코레이터를 하나만 받아서, 부하 테스트를 켜도 단계 로그가 덮이지 않도록 부하 테스트 측정을 바깥에 합친다.
    private TaskDecorator taskDecorator(
            ThreadPoolTaskExecutor executor,
            ObjectProvider<LoadTestMetrics> loadTestMetrics
    ) {
        List<TaskDecorator> decorators = new ArrayList<>();
        decorators.add(new ExtractionTaskDecorator(executor));
        loadTestMetrics.ifAvailable(metrics -> decorators.add(metrics::observeTask));
        return new CompositeTaskDecorator(decorators);
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
