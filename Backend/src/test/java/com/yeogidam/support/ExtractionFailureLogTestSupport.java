package com.yeogidam.support;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.yeogidam.media.extraction.service.MediaExtractionDispatcher;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.slf4j.LoggerFactory;

public abstract class ExtractionFailureLogTestSupport extends IntegrationTestSupport {

    private final Logger logger = (Logger) LoggerFactory.getLogger(MediaExtractionDispatcher.class);
    private final ListAppender<ILoggingEvent> diagnostics = new ListAppender<>();

    @BeforeEach
    void captureFailureLogs() {
        diagnostics.list = new CopyOnWriteArrayList<>();
        diagnostics.start();
        logger.addAppender(diagnostics);
    }

    @AfterEach
    void stopCapturingFailureLogs() {
        logger.detachAppender(diagnostics);
        diagnostics.stop();
    }

    private boolean isDiagnostic(ILoggingEvent event) {
        return (event.getLevel() == Level.WARN || event.getLevel() == Level.ERROR) && event.getKeyValuePairs() != null
                && event.getKeyValuePairs().stream().anyMatch(pair ->
                pair.key.equals("type") && pair.value.equals("PLACE_EXTRACTION_FAILED"));
    }

    protected List<ILoggingEvent> failureLogs() {
        return diagnostics.list.stream()
                .filter(this::isDiagnostic)
                .toList();
    }
}
