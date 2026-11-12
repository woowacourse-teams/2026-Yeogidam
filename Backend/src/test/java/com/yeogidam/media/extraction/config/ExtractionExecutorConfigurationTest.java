package com.yeogidam.media.extraction.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertAll;

import com.yeogidam.media.extraction.infrastructure.MediaExtractionExecutor;
import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.env.SystemEnvironmentPropertySource;
import org.springframework.core.io.ClassPathResource;
import org.springframework.web.client.RestClient;

class ExtractionExecutorConfigurationTest {

    @Test
    void 환경변수가_없으면_메타데이터_8개와_분석_10개의_코어를_유지한다() throws IOException {
        // given
        try (var context = createContext(Map.of())) {
            // when & then
            assertPool(context.getBean("mediaMetadataExecutor", MediaExtractionExecutor.class), 8, 100);
            assertPool(context.getBean("mediaAnalysisExecutor", MediaExtractionExecutor.class), 10, 100);
        }
    }

    @ParameterizedTest
    @CsvSource({"3, 5, 7, 11", "2, 1, 4, 6"})
    void 환경변수의_코어와_대기열_설정을_실제_풀에_반영한다(
            int metadataCore,
            int analysisCore,
            int metadataQueue,
            int analysisQueue
    ) throws IOException {
        // given
        Map<String, Object> environment = Map.of(
                "EXTRACTION_METADATA_CORE_POOL_SIZE", String.valueOf(metadataCore),
                "EXTRACTION_ANALYSIS_CORE_POOL_SIZE", String.valueOf(analysisCore),
                "EXTRACTION_METADATA_QUEUE_CAPACITY", String.valueOf(metadataQueue),
                "EXTRACTION_ANALYSIS_QUEUE_CAPACITY", String.valueOf(analysisQueue)
        );
        try (var context = createContext(environment)) {
            // when & then
            assertPool(context.getBean("mediaMetadataExecutor", MediaExtractionExecutor.class),
                    metadataCore, metadataQueue);
            assertPool(context.getBean("mediaAnalysisExecutor", MediaExtractionExecutor.class),
                    analysisCore, analysisQueue);
        }
    }

    private AnnotationConfigApplicationContext createContext(Map<String, Object> environment) throws IOException {
        var context = new AnnotationConfigApplicationContext();
        var sources = context.getEnvironment().getPropertySources();
        sources.remove(StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME);
        sources.remove(StandardEnvironment.SYSTEM_PROPERTIES_PROPERTY_SOURCE_NAME);
        Map<String, Object> variables = new HashMap<>(environment);
        variables.put("GEMINI_API_KEY", "test");
        variables.put("GEMINI_MODEL", "test");
        variables.put("KAKAO_CLIENT_ID", "test");
        sources.addFirst(new SystemEnvironmentPropertySource("testEnvironment", variables));
        new YamlPropertySourceLoader().load("application", new ClassPathResource("application.yml"))
                .forEach(sources::addLast);
        context.register(ExtractionConfig.class);
        context.registerBean(io.micrometer.core.instrument.MeterRegistry.class,
                io.micrometer.core.instrument.simple.SimpleMeterRegistry::new);
        context.registerBean(RestClient.Builder.class, () -> RestClient.builder(), bean -> bean.setScope("prototype"));
        context.refresh();
        return context;
    }

    private void assertPool(MediaExtractionExecutor executor, int coreSize, int queueCapacity) {
        assertAll(
                () -> assertThat(executor.getCorePoolSize()).isEqualTo(coreSize),
                () -> assertThat(executor.getMaxPoolSize()).isEqualTo(coreSize),
                () -> assertThat(executor.getPoolSize()).isEqualTo(coreSize),
                () -> assertThat(executor.getQueueCapacity()).isEqualTo(queueCapacity)
        );
    }
}
