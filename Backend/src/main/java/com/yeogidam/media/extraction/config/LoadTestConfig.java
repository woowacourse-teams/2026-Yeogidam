package com.yeogidam.media.extraction.config;

import com.yeogidam.media.extraction.infrastructure.loadtest.LoadTestBeanPostProcessor;
import com.yeogidam.media.extraction.infrastructure.loadtest.LoadTestHttpRouting;
import com.yeogidam.media.extraction.infrastructure.loadtest.LoadTestMetrics;
import com.yeogidam.media.extraction.infrastructure.loadtest.LoadTestRoutingPolicy;
import com.yeogidam.media.extraction.repository.LoadTestMediaDao;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.beans.factory.config.ConfigurableListableBeanFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(LoadTestProperties.class)
@ConditionalOnProperty(name = "media.extraction.load-test.enabled", havingValue = "true")
public class LoadTestConfig {

    @Bean
    public static LoadTestBeanPostProcessor loadTestBeanPostProcessor(ConfigurableListableBeanFactory beanFactory) {
        return new LoadTestBeanPostProcessor(beanFactory);
    }

    @Bean
    public LoadTestRoutingPolicy loadTestRoutingPolicy(
            LoadTestProperties properties,
            LoadTestMediaDao loadTestMediaDao
    ) {
        return new LoadTestRoutingPolicy(properties, loadTestMediaDao);
    }

    @Bean
    public LoadTestHttpRouting loadTestHttpRouting(LoadTestProperties properties) {
        return new LoadTestHttpRouting(properties);
    }

    @Bean
    public LoadTestMetrics loadTestMetrics(MeterRegistry registry) {
        return new LoadTestMetrics(registry);
    }
}
