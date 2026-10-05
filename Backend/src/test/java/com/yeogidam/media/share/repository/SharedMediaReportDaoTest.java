package com.yeogidam.media.share.repository;

import static org.assertj.core.api.Assertions.assertThat;

import com.yeogidam.media.extraction.domain.ExtractionFailureReason;
import com.yeogidam.media.extraction.domain.ExtractionStatus;
import com.yeogidam.media.share.domain.SharedMediaReport;
import com.yeogidam.support.JdbcTestSupport;
import com.yeogidam.support.fixture.sql.MediaSqlFixture;
import com.yeogidam.support.fixture.sql.MemberSqlFixture;
import com.yeogidam.support.fixture.sql.SharedMediaReportSqlFixture;
import com.yeogidam.support.fixture.sql.SharedMediaReportSqlFixture.ReportState;
import com.yeogidam.support.fixture.sql.SharedMediaSqlFixture;
import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

@Import(SharedMediaReportDao.class)
class SharedMediaReportDaoTest extends JdbcTestSupport {

    private static final Long MEMBER_ID = 1L;
    private static final Long MEDIA_ID = 201L;
    private static final Long PREVIOUS_SHARED_MEDIA_ID = 101L;
    private static final Long SHARED_MEDIA_ID = 102L;
    private static final int EXTRACTION_VERSION = 1;
    private static final Instant REPORTED_AT = Instant.parse("2026-10-06T01:00:00.123456Z");
    private static final Instant PREVIOUS_REPORTED_AT = REPORTED_AT.minus(Duration.ofMinutes(30));
    private static final Instant SHARED_AT = REPORTED_AT.minus(Duration.ofHours(1));

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private SharedMediaReportDao sharedMediaReportDao;

    @Test
    void 신고를_저장하면_생성된_ID를_반환하고_공유_이력과_접수_시각을_저장한다() {
        // given: 기존 신고가 있어 새 신고의 생성 ID와 공유 이력 ID를 구분할 수 있다.
        MemberSqlFixture.insertKakaoMember(jdbcTemplate, MEMBER_ID, "report-dao-owner", null, null, null);
        MediaSqlFixture.insertFailedMedia(
                jdbcTemplate,
                MEDIA_ID,
                EXTRACTION_VERSION,
                ExtractionFailureReason.UNEXPECTED
        );
        SharedMediaSqlFixture.insertSharedMedia(jdbcTemplate, PREVIOUS_SHARED_MEDIA_ID, MEMBER_ID, MEDIA_ID, SHARED_AT);
        SharedMediaSqlFixture.insertSharedMedia(jdbcTemplate, SHARED_MEDIA_ID, MEMBER_ID, MEDIA_ID, SHARED_AT);
        SharedMediaReportSqlFixture fixture = new SharedMediaReportSqlFixture(jdbcTemplate);
        fixture.insertReport(PREVIOUS_SHARED_MEDIA_ID, PREVIOUS_REPORTED_AT);
        ReportState previous = fixture.reports().getFirst();
        SharedMediaReport report = new SharedMediaReport(SHARED_MEDIA_ID, ExtractionStatus.FAILED, REPORTED_AT);

        // when
        Long reportId = sharedMediaReportDao.save(report);

        // then
        assertThat(fixture.reports())
                .containsExactly(previous, new ReportState(reportId, SHARED_MEDIA_ID, REPORTED_AT));
    }
}
