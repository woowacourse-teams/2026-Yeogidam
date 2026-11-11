package com.yeogidam.media.extraction.service;

import static com.yeogidam.support.fixture.sql.MediaPlaceSqlFixture.insertMediaPlace;
import static com.yeogidam.support.fixture.sql.MediaSqlFixture.insertExtractingMedia;
import static com.yeogidam.support.fixture.sql.MediaSqlFixture.sharedUrl;
import static com.yeogidam.support.fixture.sql.MemberSqlFixture.insertKakaoMember;
import static com.yeogidam.support.fixture.sql.PlaceSqlFixture.insertPlaceWithRequiredColumnsOnly;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertAll;

import com.yeogidam.media.extraction.config.ExtractionProperties;
import com.yeogidam.media.extraction.domain.ExtractionReport;
import com.yeogidam.media.instagram.domain.InstagramUrl;
import com.yeogidam.media.instagram.exception.InstagramContentUnavailableException;
import com.yeogidam.media.share.dto.request.ShareRequest;
import com.yeogidam.media.share.dto.response.ShareResponse;
import com.yeogidam.media.share.service.ShareService;
import com.yeogidam.support.IntegrationTestSupport;
import com.yeogidam.support.fake.FakeExtractionRetryExecutor;
import java.math.BigDecimal;
import java.util.List;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Import(MediaExtractionDispatchIntegrationTest.FakeMetadataServiceConfiguration.class)
class MediaExtractionDispatchIntegrationTest extends IntegrationTestSupport {

    private static final String INSTAGRAM_URL = "https://www.instagram.com/reel/async-stage-one/";
    private static final Long MEMBER_ID = 1L;
    private static final Long OTHER_MEMBER_ID = 2L;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ExtractionProperties extractionProperties;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @Autowired
    private ShareService shareService;

    @Autowired
    private FakeMediaExtractionPipeline extractionPipeline;

    @Autowired
    private FakeExtractionRetryExecutor extractionExecutor;

    @BeforeEach
    void setUp() {
        extractionPipeline.reset();
        extractionExecutor.reset();
    }

    @AfterEach
    void finishExtractions() throws Exception {
        extractionPipeline.allowExtractionToFinish();
        extractionExecutor.awaitCompletion();
    }

    @Test
    void 같은_새_미디어를_동시에_공유해도_미디어는_하나이고_최초_분석은_한번만_등록한다() throws Exception {
        // given
        insertKakaoMember(jdbcTemplate, MEMBER_ID, "concurrent-share-user", "동시 공유 회원",
                "concurrent-share@example.com", null);
        insertKakaoMember(jdbcTemplate, OTHER_MEMBER_ID, "other-share-user", "다른 공유 회원",
                "other-share@example.com", null);
        extractionPipeline.blockExtraction();
        CountDownLatch start = new CountDownLatch(1);

        try (ExecutorService executor = Executors.newFixedThreadPool(2)) {
            // when
            Future<ShareResponse> first = executor.submit(() -> {
                awaitLatch(start);
                return shareService.createShare(MEMBER_ID, new ShareRequest(INSTAGRAM_URL));
            });
            Future<ShareResponse> second = executor.submit(() -> {
                awaitLatch(start);
                return shareService.createShare(OTHER_MEMBER_ID, new ShareRequest(INSTAGRAM_URL));
            });
            start.countDown();
            ShareResponse firstResponse = first.get(10, TimeUnit.SECONDS);
            ShareResponse secondResponse = second.get(10, TimeUnit.SECONDS);

            // then
            assertAll(
                    () -> assertThat(firstResponse.extractionStatus()).isEqualTo("EXTRACTING"),
                    () -> assertThat(secondResponse.extractionStatus()).isEqualTo("EXTRACTING"),
                    () -> assertThat(firstResponse.sharedMediaId()).isNotEqualTo(secondResponse.sharedMediaId()),
                    () -> assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM media", Integer.class))
                            .isEqualTo(1),
                    () -> assertThat(jdbcTemplate.queryForList(
                            "SELECT member_id FROM shared_media ORDER BY member_id", Long.class))
                            .containsExactly(MEMBER_ID, OTHER_MEMBER_ID),
                    () -> assertThat(jdbcTemplate.queryForObject(
                            "SELECT COUNT(DISTINCT media_id) FROM shared_media", Integer.class)).isEqualTo(1),
                    () -> assertThat(extractionExecutor.countSubmittedTasks()).isEqualTo(1)
            );
        } finally {
            extractionPipeline.allowExtractionToFinish();
        }
    }

    @Test
    void 공유_이력_저장이_실패하면_새_미디어도_롤백하고_최초_분석을_등록하지_않는다() {
        // given: 존재하지 않는 회원이 공유하면 공유 이력의 외래키 제약으로 저장이 실패한다.
        ShareRequest request = new ShareRequest(INSTAGRAM_URL);

        // when & then
        assertThatThrownBy(() -> shareService.createShare(MEMBER_ID, request))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertAll(
                () -> assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM media", Integer.class)).isZero(),
                () -> assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM shared_media", Integer.class))
                        .isZero(),
                () -> assertThat(extractionExecutor.countSubmittedTasks()).isZero()
        );
    }

    @Test
    void 공유_이력_저장이_실패하면_재시도_상태_변경도_롤백하고_재분석을_등록하지_않는다() {
        // given
        int failedVersion = extractionProperties.pipelineVersion() - 1;
        Long mediaId = insertFailedMedia("async-stage-one", failedVersion);
        ShareRequest request = new ShareRequest(INSTAGRAM_URL);

        // when & then
        assertThatThrownBy(() -> shareService.createShare(MEMBER_ID, request))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertAll(
                () -> assertThat(readExtractionStatus(mediaId)).isEqualTo("FAILED"),
                () -> assertThat(readFailureReason(mediaId)).isEqualTo("UNEXPECTED"),
                () -> assertThat(readExtractionVersion(mediaId)).isEqualTo(failedVersion),
                () -> assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM shared_media", Integer.class))
                        .isZero(),
                () -> assertThat(extractionExecutor.countSubmittedTasks()).isZero()
        );
    }

    @Test
    void 새_미디어_추출은_공유_커밋_후_비동기로_시작하고_진행중이거나_완료된_미디어는_재추출하지_않는다()
            throws Exception {
        // given
        insertKakaoMember(jdbcTemplate, MEMBER_ID, "async-extraction-user", "async-extraction-user",
                "async-extraction-user@example.com", null);
        extractionPipeline.blockExtraction();
        ExecutorService executor = Executors.newFixedThreadPool(2);
        CountDownLatch shareSaved = new CountDownLatch(1);
        CountDownLatch allowCommit = new CountDownLatch(1);

        try {
            // when
            Future<?> shareTransaction = executor.submit(() -> new TransactionTemplate(transactionManager)
                    .executeWithoutResult(status -> {
                        shareService.createShare(MEMBER_ID, new ShareRequest(INSTAGRAM_URL));

                        // then: RR 트랜잭션이 열린 동안 분석을 실행기에 등록하지 않는다.
                        assertThat(jdbcTemplate.queryForObject("SELECT @@transaction_isolation", String.class))
                                .isEqualTo("REPEATABLE-READ");
                        assertThat(extractionExecutor.countSubmittedTasks()).isZero();
                        shareSaved.countDown();
                        awaitLatch(allowCommit);
                    }));
            assertThat(shareSaved.await(5, TimeUnit.SECONDS)).isTrue();
            Future<ShareResponse> concurrentShare = executor.submit(() -> shareService.createShare(
                    MEMBER_ID, new ShareRequest(INSTAGRAM_URL)));
            awaitMediaUpsertWaiter();
            assertThat(extractionExecutor.countSubmittedTasks()).isZero();
            allowCommit.countDown();
            MetadataRequest request = extractionPipeline.takeRequest(5, TimeUnit.SECONDS);

            // then: 추출 작업이 대기 중이어도 공유 트랜잭션은 커밋되어 반환된다.
            assertThat(shareTransaction.get(1, TimeUnit.SECONDS)).isNull();
            assertThat(concurrentShare.get(5, TimeUnit.SECONDS).extractionStatus()).isEqualTo("EXTRACTING");
            assertThat(extractionExecutor.countSubmittedTasks()).isEqualTo(1);
            assertThat(request).isNotNull();
            assertThat(request.instagramUrl()).isEqualTo(new InstagramUrl(INSTAGRAM_URL));
            assertThat(request.mediaId()).isEqualTo(jdbcTemplate.queryForObject(
                    "SELECT id FROM media WHERE media_shortcode = ?", Long.class, "async-stage-one"));
            assertThat(jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM shared_media WHERE member_id = ? AND media_id = ?",
                    Integer.class,
                    MEMBER_ID,
                    request.mediaId())).isEqualTo(2);

            // when: 기존 추출이 진행 중인 미디어를 다시 공유한다.
            shareService.createShare(MEMBER_ID, new ShareRequest(INSTAGRAM_URL));

            // then: 진행 중인 추출 작업이 있으므로 새 추출 요청을 발행하지 않는다.
            assertThat(extractionPipeline.pollRequest(1, TimeUnit.SECONDS)).isNull();
        } finally {
            allowCommit.countDown();
            extractionPipeline.allowExtractionToFinish();
            executor.shutdownNow();
            assertThat(executor.awaitTermination(5, TimeUnit.SECONDS)).isTrue();
        }
        assertThat(extractionPipeline.awaitExtractionFinish(5, TimeUnit.SECONDS)).isTrue();
        assertThat(extractionPipeline.extractionFailure()).isNull();

        Long mediaId = jdbcTemplate.queryForObject(
                "SELECT id FROM media WHERE media_shortcode = ?", Long.class, "async-stage-one");
        jdbcTemplate.update("UPDATE media SET extraction_status = 'SUCCEEDED' WHERE id = ?", mediaId);

        // when: 추출이 완료된 미디어를 다시 공유한다.
        shareService.createShare(MEMBER_ID, new ShareRequest(INSTAGRAM_URL));

        // then: 완료된 미디어도 추출 요청을 다시 발행하지 않는다.
        assertThat(extractionPipeline.pollRequest(1, TimeUnit.SECONDS)).isNull();
    }

    @Test
    void 분석_완료_커밋을_기다린_공유는_최신_성공_상태와_장소를_사용한다() throws Exception {
        // given
        insertKakaoMember(jdbcTemplate, MEMBER_ID, "completed-share-user", "분석 완료 대기 회원",
                "completed-share@example.com", null);
        insertExtractingMedia(jdbcTemplate, 1L);
        insertPlaceWithRequiredColumnsOnly(jdbcTemplate, 1L, "place-1", "기존 장소", "서울 광진구",
                new BigDecimal("37.5"), new BigDecimal("127.0"));
        CountDownLatch resultSaved = new CountDownLatch(1);
        CountDownLatch allowCommit = new CountDownLatch(1);
        ExecutorService executor = Executors.newFixedThreadPool(2);

        try {
            Future<?> completion = executor.submit(() -> new TransactionTemplate(transactionManager)
                    .executeWithoutResult(status -> {
                        jdbcTemplate.queryForObject("SELECT id FROM media WHERE id = ? FOR UPDATE", Long.class, 1L);
                        insertMediaPlace(jdbcTemplate, 1L, 1L, 1L);
                        jdbcTemplate.update("UPDATE media SET extraction_status = 'SUCCEEDED' WHERE id = ?", 1L);
                        resultSaved.countDown();
                        awaitLatch(allowCommit);
                    }));
            assertThat(resultSaved.await(5, TimeUnit.SECONDS)).isTrue();

            // when
            Future<ShareResponse> share = executor.submit(() -> shareService.createShare(
                    MEMBER_ID, new ShareRequest(sharedUrl(1L))));
            awaitMediaUpsertWaiter();
            allowCommit.countDown();
            completion.get(5, TimeUnit.SECONDS);
            ShareResponse response = share.get(5, TimeUnit.SECONDS);

            // then
            assertAll(
                    () -> assertThat(response.extractionStatus()).isEqualTo("SUCCEEDED"),
                    () -> assertThat(jdbcTemplate.queryForObject(
                            "SELECT extraction_status FROM shared_media WHERE id = ?",
                            String.class, response.sharedMediaId())).isEqualTo("SUCCEEDED"),
                    () -> assertThat(jdbcTemplate.queryForList("""
                            SELECT sp.place_id
                            FROM saved_places sp
                            JOIN shared_media_saved_places smsp ON smsp.saved_place_id = sp.id
                            WHERE sp.member_id = ? AND smsp.shared_media_id = ?
                            """, Long.class, MEMBER_ID, response.sharedMediaId())).containsExactly(1L),
                    () -> assertThat(extractionExecutor.countSubmittedTasks()).isZero()
            );
        } finally {
            allowCommit.countDown();
            executor.shutdownNow();
            assertThat(executor.awaitTermination(5, TimeUnit.SECONDS)).isTrue();
        }
    }

    @Test
    void 재시도_가능한_실패_사유와_파이프라인_버전_증가_시_다시_분석한다() throws Exception {
        // given
        insertKakaoMember(jdbcTemplate, MEMBER_ID, "retry-extraction-user", "retry-extraction-user",
                "retry-extraction-user@example.com", null);
        insertKakaoMember(jdbcTemplate, OTHER_MEMBER_ID, "retry-extraction-user-b", "retry-extraction-user-b",
                "retry-extraction-user-b@example.com", null);
        int pipelineVersion = extractionProperties.pipelineVersion();
        Long mediaId = insertFailedMedia("async-stage-one", pipelineVersion);
        int failedVersion = readExtractionVersion(mediaId);

        // when: 같은 파이프라인 버전의 UNEXPECTED 실패 미디어를 재공유한다.
        ShareResponse response = shareService.createShare(MEMBER_ID, new ShareRequest(INSTAGRAM_URL));
        MetadataRequest sameVersionRetry = extractionPipeline.takeRequest(5, TimeUnit.SECONDS);

        // then: 재시도를 예약하고 실패 사유는 지우되 파이프라인 버전은 유지하며, 응답은 EXTRACTING이다.
        assertThat(response.extractionStatus()).isEqualTo("EXTRACTING");
        assertThat(sameVersionRetry).isNotNull();
        assertThat(sameVersionRetry.mediaId()).isEqualTo(mediaId);
        assertThat(readExtractionStatus(mediaId)).isEqualTo("EXTRACTING");
        assertThat(readFailureReason(mediaId)).isNull();
        assertThat(readExtractionVersion(mediaId)).isEqualTo(failedVersion);

        // when: 같은 버전에서 재시도 대상이 아닌 실패 사유를 다시 공유한다.
        jdbcTemplate.update(
                "UPDATE media SET extraction_status = 'FAILED', failure_reason = 'PLACE_NOT_MATCHED' WHERE id = ?",
                mediaId);
        shareService.createShare(MEMBER_ID, new ShareRequest(INSTAGRAM_URL));

        // then: 재시도 대상이 아니므로 실패 상태를 유지한다.
        assertThat(extractionPipeline.pollRequest(250, TimeUnit.MILLISECONDS)).isNull();
        assertThat(readExtractionStatus(mediaId)).isEqualTo("FAILED");
        assertThat(readFailureReason(mediaId)).isEqualTo("PLACE_NOT_MATCHED");
        assertThat(readExtractionVersion(mediaId)).isEqualTo(failedVersion);

        // when: 파이프라인 버전이 올라간 뒤 같은 미디어가 공유된다.
        jdbcTemplate.update("UPDATE media SET failure_reason = 'UNEXPECTED', extraction_version = ? WHERE id = ?",
                pipelineVersion - 1, mediaId);
        shareService.createShare(OTHER_MEMBER_ID, new ShareRequest(INSTAGRAM_URL));
        MetadataRequest retryRequest = extractionPipeline.takeRequest(5, TimeUnit.SECONDS);

        // then: 실패 상태를 해제하고 새 버전으로 재분석을 예약한다.
        assertThat(retryRequest).isNotNull();
        assertThat(retryRequest.mediaId()).isEqualTo(mediaId);
        assertThat(readExtractionStatus(mediaId)).isEqualTo("EXTRACTING");
        assertThat(readFailureReason(mediaId)).isNull();
        assertThat(readExtractionVersion(mediaId)).isEqualTo(pipelineVersion);
    }

    @Test
    void 인스타그램_콘텐츠를_가져오지_못하면_CONTENT_UNAVAILABLE로_기록한다() throws Exception {
        // given
        insertKakaoMember(jdbcTemplate, MEMBER_ID, "unavailable-content-user", "unavailable-content-user",
                "unavailable-content-user@example.com", null);
        extractionPipeline.failNextExtraction(new InstagramContentUnavailableException(
                "인스타그램 콘텐츠를 사용할 수 없습니다."));

        // when
        shareService.createShare(MEMBER_ID, new ShareRequest(INSTAGRAM_URL));
        MetadataRequest request = extractionPipeline.takeRequest(5, TimeUnit.SECONDS);
        assertThat(request).isNotNull();
        Long mediaId = request.mediaId();

        // then
        awaitExtractionStatus(mediaId, "FAILED");
        assertThat(request.mediaId()).isEqualTo(mediaId);
        assertThat(readFailureReason(mediaId)).isEqualTo("CONTENT_UNAVAILABLE");
    }

    @Test
    void 파이프라인_버전이_오른_실패_미디어를_동시에_재공유해도_추출은_한번만_예약한다() throws Exception {
        // given
        insertKakaoMember(jdbcTemplate, MEMBER_ID, "concurrent-retry-user", "concurrent-retry-user",
                "concurrent-retry-user@example.com", null);
        Long mediaId = insertFailedMedia("async-stage-one", extractionProperties.pipelineVersion() - 1);
        extractionPipeline.blockExtraction();
        ExecutorService executor = Executors.newFixedThreadPool(2);

        try {
            // when: 두 공유 요청이 이전 파이프라인 버전의 FAILED 미디어를 재공유한다.
            Future<ShareResponse> firstShare = executor.submit(() -> shareService.createShare(
                    MEMBER_ID, new ShareRequest(INSTAGRAM_URL)));
            Future<ShareResponse> secondShare = executor.submit(() -> shareService.createShare(
                    MEMBER_ID, new ShareRequest(INSTAGRAM_URL)));
            // then: 조건부 상태 전이에서 승리한 한 작업만 재분석하고, 두 요청 모두 EXTRACTING을 돌려준다.
            assertThat(firstShare.get(2, TimeUnit.SECONDS).extractionStatus()).isEqualTo("EXTRACTING");
            assertThat(secondShare.get(2, TimeUnit.SECONDS).extractionStatus()).isEqualTo("EXTRACTING");
            MetadataRequest request = extractionPipeline.takeRequest(5, TimeUnit.SECONDS);
            assertThat(request).isNotNull();
            assertThat(request.mediaId()).isEqualTo(mediaId);
            assertThat(extractionPipeline.pollRequest(1, TimeUnit.SECONDS)).isNull();
            assertThat(readExtractionStatus(mediaId)).isEqualTo("EXTRACTING");
        } finally {
            extractionPipeline.allowExtractionToFinish();
            executor.shutdownNow();
        }
        assertThat(extractionPipeline.awaitExtractionFinish(5, TimeUnit.SECONDS)).isTrue();
    }

    @TestConfiguration
    static class FakeMetadataServiceConfiguration {

        @Bean
        @Primary
        FakeExtractionRetryExecutor fakeExtractionRetryExecutor() {
            return new FakeExtractionRetryExecutor();
        }

        @Bean
        @Primary
        FakeMediaExtractionPipeline fakeMediaExtractionPipeline() {
            return new FakeMediaExtractionPipeline();
        }
    }

    record MetadataRequest(Long mediaId, InstagramUrl instagramUrl) {
    }

    private static void awaitLatch(CountDownLatch latch) {
        try {
            if (!latch.await(10, TimeUnit.SECONDS)) {
                throw new IllegalStateException("동시 공유 요청의 대기 신호를 받지 못했습니다.");
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("동시 공유 요청 대기가 중단되었습니다.", exception);
        }
    }

    private void awaitMediaUpsertWaiter() throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        List<String> statements = List.of();
        while (System.nanoTime() < deadline) {
            statements = jdbcTemplate.queryForList("SHOW FULL PROCESSLIST")
                    .stream()
                    .map(row -> row.get("Info"))
                    .filter(info -> info != null)
                    .map(Object::toString)
                    .filter(info -> info.contains("INSERT INTO media") && info.contains("ON DUPLICATE KEY UPDATE"))
                    .toList();
            if (!statements.isEmpty()) {
                return;
            }
            Thread.sleep(10);
        }
        throw new AssertionError("미디어 UPSERT가 잠금을 기다리지 않습니다. 보인 문장: " + statements);
    }

    static class FakeMediaExtractionPipeline extends MediaExtractionPipeline {

        private final BlockingQueue<MetadataRequest> requests = new LinkedBlockingQueue<>();
        private final AtomicReference<RuntimeException> nextFailure = new AtomicReference<>();
        private final AtomicReference<Throwable> extractionFailure = new AtomicReference<>();

        private volatile CountDownLatch extractionCanFinish = new CountDownLatch(0);
        private volatile CountDownLatch extractionFinished = new CountDownLatch(0);

        FakeMediaExtractionPipeline() {
            super(null, null, null, null, null);
        }

        @Override
        public void extract(
                Long mediaId,
                InstagramUrl instagramUrl,
                ExtractionReport report
        ) {
            requests.add(new MetadataRequest(mediaId, instagramUrl));
            try {
                waitForExtractionToFinish();
                RuntimeException failure = nextFailure.getAndSet(null);
                if (failure != null) {
                    extractionFailure.set(failure);
                    throw failure;
                }
            } finally {
                extractionFinished.countDown();
            }
        }

        private void waitForExtractionToFinish() {
            try {
                CountDownLatch finishSignal = extractionCanFinish;
                if (!finishSignal.await(5, TimeUnit.SECONDS)) {
                    IllegalStateException failure = new IllegalStateException("테스트가 추출 진행을 허용하는 신호를 5초 안에 보내지 않았습니다.");
                    extractionFailure.set(failure);
                    throw failure;
                }
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                extractionFailure.set(exception);
                throw new IllegalStateException("추출 대기가 중단되었습니다.", exception);
            }
        }

        private MetadataRequest takeRequest(long timeout, TimeUnit timeUnit) throws InterruptedException {
            return requests.poll(timeout, timeUnit);
        }

        private MetadataRequest pollRequest(long timeout, TimeUnit timeUnit) {
            try {
                return requests.poll(timeout, timeUnit);
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException("추출 요청 확인이 중단되었습니다.", exception);
            }
        }

        private boolean awaitExtractionFinish(long timeout, TimeUnit timeUnit) throws InterruptedException {
            return extractionFinished.await(timeout, timeUnit);
        }

        private Throwable extractionFailure() {
            return extractionFailure.get();
        }

        private void allowExtractionToFinish() {
            extractionCanFinish.countDown();
        }

        private void blockExtraction() {
            extractionCanFinish = new CountDownLatch(1);
            extractionFinished = new CountDownLatch(1);
        }

        private void failNextExtraction(RuntimeException failure) {
            nextFailure.set(failure);
        }

        private void reset() {
            requests.clear();
            nextFailure.set(null);
            extractionFailure.set(null);
            extractionCanFinish = new CountDownLatch(0);
            extractionFinished = new CountDownLatch(0);
        }
    }

    private Long insertFailedMedia(String shortcode, int extractionVersion) {
        jdbcTemplate.update("""
                INSERT INTO media (
                    media_shortcode, caption, thumbnail_key, author, extraction_status,
                    failure_reason, extraction_version, source_type
                )
                VALUES (?, NULL, NULL, NULL, 'FAILED', 'UNEXPECTED', ?, 'EXTRACTED')
                """, shortcode, extractionVersion);
        return jdbcTemplate.queryForObject(
                "SELECT id FROM media WHERE media_shortcode = ?", Long.class, shortcode);
    }

    private void awaitExtractionStatus(Long mediaId, String expectedStatus) throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (System.nanoTime() < deadline) {
            if (expectedStatus.equals(readExtractionStatus(mediaId))) {
                return;
            }
            Thread.sleep(10);
        }
        assertThat(readExtractionStatus(mediaId)).isEqualTo(expectedStatus);
    }

    private String readExtractionStatus(Long mediaId) {
        return jdbcTemplate.queryForObject(
                "SELECT extraction_status FROM media WHERE id = ?", String.class, mediaId);
    }

    private String readFailureReason(Long mediaId) {
        return jdbcTemplate.queryForObject(
                "SELECT failure_reason FROM media WHERE id = ?", String.class, mediaId);
    }

    private Integer readExtractionVersion(Long mediaId) {
        return jdbcTemplate.queryForObject(
                "SELECT extraction_version FROM media WHERE id = ?", Integer.class, mediaId);
    }
}
