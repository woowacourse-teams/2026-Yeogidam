package com.yeogidam.media.instagram.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

@Configuration
public class InstagramConfig {

    @Bean("instagramRestClient")
    public RestClient instagramRestClient(RestClient.Builder builder) {
        return builder.build();
    }
}
