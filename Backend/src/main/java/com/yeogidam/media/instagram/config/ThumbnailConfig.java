package com.yeogidam.media.instagram.config;

import java.net.http.HttpClient;
import java.time.Duration;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;

@Configuration
@EnableConfigurationProperties(ThumbnailProperties.class)
public class ThumbnailConfig {

    @Bean
    public S3Client s3Client(ThumbnailProperties thumbnailProperties) {
        return S3Client.builder()
                .region(Region.of(thumbnailProperties.region()))
                .build();
    }

    @Bean
    public HttpClient thumbnailHttpClient() {
        return HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();
    }
}
