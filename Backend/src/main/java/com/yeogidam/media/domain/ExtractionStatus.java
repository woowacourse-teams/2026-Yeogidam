package com.yeogidam.media.domain;

import java.util.function.Supplier;

public enum ExtractionStatus {

    EXTRACTING {
        @Override
        public Extraction toExtraction(
                Supplier<ExtractedPlaces> places,
                Supplier<ExtractionFailureReason> failureReason
        ) {
            return new InProgressExtraction();
        }
    },
    SUCCEEDED {
        @Override
        public Extraction toExtraction(
                Supplier<ExtractedPlaces> places,
                Supplier<ExtractionFailureReason> failureReason
        ) {
            return new SucceededExtraction(places.get());
        }
    },
    FAILED {
        @Override
        public Extraction toExtraction(
                Supplier<ExtractedPlaces> places,
                Supplier<ExtractionFailureReason> failureReason
        ) {
            return new FailedExtraction(failureReason.get());
        }
    };

    public abstract Extraction toExtraction(
            Supplier<ExtractedPlaces> places,
            Supplier<ExtractionFailureReason> failureReason
    );
}
