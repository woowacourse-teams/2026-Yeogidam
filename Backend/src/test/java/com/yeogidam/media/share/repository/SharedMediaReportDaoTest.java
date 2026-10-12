package com.yeogidam.media.share.repository;

import static com.yeogidam.support.fixture.sql.MediaSqlFixture.insertFailedMedia;
import static com.yeogidam.support.fixture.sql.MemberSqlFixture.insertKakaoMember;
import static com.yeogidam.support.fixture.sql.SharedMediaReportSqlFixture.insertReport;
import static com.yeogidam.support.fixture.sql.SharedMediaSqlFixture.insertSharedMedia;
import static org.assertj.core.api.Assertions.assertThat;

import com.yeogidam.media.extraction.domain.ExtractionFailureReason;
import com.yeogidam.media.extraction.domain.ExtractionStatus;
import com.yeogidam.media.share.domain.SharedMediaReport;
import com.yeogidam.support.JdbcTestSupport;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

@Import(SharedMediaReportDao.class)
class SharedMediaReportDaoTest extends JdbcTestSupport {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private SharedMediaReportDao sharedMediaReportDao;

    @Test
    void 신고를_저장하면_생성된_ID를_반환하고_공유_이력과_접수_시각을_저장한다() {
        // given: 기존 신고가 있어 새 신고의 생성 ID와 공유 이력 ID를 구분할 수 있다.
        insertKakaoMember(jdbcTemplate, 1L, "report-dao-owner", null, null, null);
        insertFailedMedia(jdbcTemplate, 201L, 1, ExtractionFailureReason.UNEXPECTED);
        insertSharedMedia(jdbcTemplate, 101L, 1L, 201L, Instant.parse("2026-10-06T00:00:00.123456Z"));
        insertSharedMedia(jdbcTemplate, 102L, 1L, 201L, Instant.parse("2026-10-06T00:00:00.123456Z"));
        insertReport(jdbcTemplate, 1L, 101L, Instant.parse("2026-10-06T00:30:00.123456Z"));
        Instant reportedAt = Instant.parse("2026-10-06T01:00:00.123456Z");
        SharedMediaReport report = new SharedMediaReport(102L, ExtractionStatus.FAILED, reportedAt);

        // when
        Long reportId = sharedMediaReportDao.save(report);

        // then
        assertThat(readReports())
                .containsExactly(
                        new ReportState(1L, 101L, Instant.parse("2026-10-06T00:30:00.123456Z")),
                        new ReportState(reportId, 102L, reportedAt)
                );
    }

    private List<ReportState> readReports() {
        return jdbcTemplate.query("""
                SELECT id, shared_media_id, created_at
                FROM shared_media_reports
                ORDER BY shared_media_id
                """, (resultSet, rowNumber) -> new ReportState(
                resultSet.getLong("id"),
                resultSet.getLong("shared_media_id"),
                resultSet.getTimestamp("created_at").toInstant()
        ));
    }

    private record ReportState(Long id, Long sharedMediaId, Instant createdAt) {
    }
}
