package com.yeogidam.support;

import com.yeogidam.support.fake.FakeDomesticFallbackPlaceSearcher;
import com.yeogidam.support.fake.FakeDomesticPlaceSearcher;
import com.yeogidam.support.fake.FakeExtractionRetryExecutor;
import com.yeogidam.support.fake.FakeExtractionRetryExecutorConfig;
import com.yeogidam.support.fake.FakeMediaExtractionConfig;
import com.yeogidam.support.fake.FakeOverseasPlaceSearcher;
import com.yeogidam.support.fake.FakePlaceSearchHintExtractor;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;

/**
 * 실제 추출 파이프라인을 외부 API Fake와 함께 실행하는 E2E의 공통 지원 클래스.
 * 재시도와 제보 E2E가 컨텍스트 하나를 함께 쓰도록 Fake 설정과 파이프라인 버전 2를 여기서 고정한다.
 * 재시도 E2E는 버전 1에서 실패한 미디어를 이전 버전으로 다루므로 현재 버전을 2로 둔다.
 * Fake 인스턴스를 클래스끼리 공유하므로 테스트마다 상태를 초기화하고, 끝나면 접수한 추출 작업을 모두 기다린다.
 * 하위 클래스의 @BeforeEach는 이 초기화 뒤에 실행되므로 Fake 응답은 하위 클래스에서 설정한다.
 */
@TestPropertySource(properties = "media.extraction.pipeline-version=2")
@Import({FakeMediaExtractionConfig.class, FakeExtractionRetryExecutorConfig.class})
public abstract class ExtractionE2eTestSupport extends E2eTestSupport {

    @Autowired
    private FakePlaceSearchHintExtractor placeSearchHintExtractor;

    @Autowired
    private FakeDomesticPlaceSearcher domesticPlaceSearcher;

    @Autowired
    private FakeOverseasPlaceSearcher overseasPlaceSearcher;

    @Autowired
    private FakeDomesticFallbackPlaceSearcher domesticFallbackPlaceSearcher;

    @Autowired
    private FakeExtractionRetryExecutor extractionExecutor;

    @BeforeEach
    void resetExtractionFakes() {
        placeSearchHintExtractor.reset();
        domesticPlaceSearcher.reset();
        overseasPlaceSearcher.reset();
        domesticFallbackPlaceSearcher.reset();
        extractionExecutor.reset();
    }

    @AfterEach
    void awaitSubmittedExtractions() throws Exception {
        extractionExecutor.awaitCompletion();
    }
}
