package com.yeogidam.media.extraction.config;

import com.yeogidam.media.extraction.infrastructure.MediaExtractionExecutor;
import com.yeogidam.media.extraction.infrastructure.MediaExtractionLifecycle;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.DependsOn;

@Configuration
public class ExtractionLifecycleConfig {

    @Bean
    @DependsOn({"dataSource", "s3Client", "thumbnailHttpClient", "geminiMediaHttpClient", "instagramMediaHttpClient"})
    public MediaExtractionLifecycle mediaExtractionLifecycle(
            @Qualifier("mediaMetadataExecutor") MediaExtractionExecutor metadataExecutor,
            @Qualifier("mediaAnalysisExecutor") MediaExtractionExecutor analysisExecutor
    ) {
        return new MediaExtractionLifecycle(metadataExecutor, analysisExecutor);
    }
}
