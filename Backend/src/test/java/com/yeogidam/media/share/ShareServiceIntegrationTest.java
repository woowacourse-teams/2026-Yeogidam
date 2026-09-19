package com.yeogidam.media.share;

import static com.yeogidam.support.fixture.sql.MediaSqlFixture.createMedia;
import static com.yeogidam.support.fixture.sql.PlaceCandidateSqlFixture.insertUndecidedCandidate;
import static com.yeogidam.support.fixture.sql.PlaceSqlFixture.insertPlace;
import static com.yeogidam.support.fixture.sql.SharedMediaSqlFixture.createSharedMedia;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertAll;

import com.yeogidam.media.share.dto.response.ShareHistoryDetailResponse;
import com.yeogidam.media.share.dto.response.ShareHistoryResponse;
import com.yeogidam.media.share.dto.response.ShareHistoryResponses;
import com.yeogidam.media.share.exception.ShareException;
import com.yeogidam.media.share.service.ShareService;
import com.yeogidam.support.IntegrationTestSupport;
import java.sql.Timestamp;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

class ShareServiceIntegrationTest extends IntegrationTestSupport {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ShareService shareService;

    @Test
    void 서비스는_분석_성공_결과와_장소_정보를_응답으로_조립한다() {
        // given
        insertMember(910030L, "share-service-success-user");
        createMedia(jdbcTemplate, 920030L, "성수동 카페 모음", "https://img.example.com/media.jpg", "@seongsu");
        createSharedMedia(jdbcTemplate, 930030L, 910030L, 920030L,
                Timestamp.valueOf("2026-09-17 10:00:00"));

        insertPlace(jdbcTemplate, 940030L, "kakao-fixture-940030", "첫 번째 카페", "카페",
                "서울 성동구 성수동2가 1-1", "서울 성동구 연무장길 1", new java.math.BigDecimal("37.5446"),
                new java.math.BigDecimal("127.0559"), "https://place.map.kakao.com/940030", null,
                "https://img.example.com/place-1.jpg", null, null);
        insertPlace(jdbcTemplate, 940031L, "kakao-fixture-940031", "두 번째 카페", "카페",
                "부산 해운대구 중동 1-1", "부산 해운대구 해운대로 1", new java.math.BigDecimal("35.1631"),
                new java.math.BigDecimal("129.1635"), "https://place.map.kakao.com/940031", null,
                "https://img.example.com/place-2.jpg", null, null);

        insertUndecidedCandidate(jdbcTemplate, 950030L, 930030L, 940030L);
        insertUndecidedCandidate(jdbcTemplate, 950031L, 930030L, 940031L);

        // when
        ShareHistoryDetailResponse response = shareService.readShareHistoryDetail(910030L, 930030L);

        // then
        assertAll(
                () -> assertThat(response.sharedMediaId()).isEqualTo(930030L),
                () -> assertThat(response.thumbnailUrl()).isEqualTo("https://img.example.com/media.jpg"),
                () -> assertThat(response.caption()).isEqualTo("성수동 카페 모음"),
                () -> assertThat(response.author()).isEqualTo("@seongsu"),
                () -> assertThat(response.extractionStatus()).isEqualTo("SUCCEEDED"),
                () -> assertThat(response.failureReason()).isNull(),
                () -> assertThat(response.sharedUrl())
                        .isEqualTo("https://www.instagram.com/reel/fixture-930030/"),
                () -> assertThat(response.places()).hasSize(2),
                () -> assertThat(response.places().getFirst().landLotAddress())
                        .isEqualTo("서울 성동구 성수동2가 1-1"),
                () -> assertThat(response.places().getFirst().roadAddress())
                        .isEqualTo("서울 성동구 연무장길 1")
        );
    }

    @Test
    void 서비스는_게시글_접근_실패_결과의_null_게시글_정보를_응답으로_조립한다() {
        // given
        insertMember(910031L, "share-service-content-unavailable-user");
        insertMediaWithStatus(920031L, null, null, null, "FAILED", "CONTENT_UNAVAILABLE");
        createSharedMedia(jdbcTemplate, 930031L, 910031L, 920031L,
                Timestamp.valueOf("2026-09-17 10:00:00"));

        // when
        ShareHistoryDetailResponse response = shareService.readShareHistoryDetail(910031L, 930031L);

        // then
        assertAll(
                () -> assertThat(response.thumbnailUrl()).isNull(),
                () -> assertThat(response.caption()).isNull(),
                () -> assertThat(response.author()).isNull(),
                () -> assertThat(response.extractionStatus()).isEqualTo("FAILED"),
                () -> assertThat(response.failureReason()).isEqualTo("CONTENT_UNAVAILABLE"),
                () -> assertThat(response.places()).isEmpty()
        );
    }

    @Test
    void 서비스는_장소_추출_실패_결과의_게시글_정보와_실패_사유를_응답으로_조립한다() {
        // given
        insertMember(910032L, "share-service-place-not-extracted-user");
        insertMediaWithStatus(
                920032L,
                "장소가 없는 게시글",
                "https://img.example.com/media.jpg",
                "@author",
                "FAILED",
                "PLACE_NOT_EXTRACTED"
        );
        createSharedMedia(jdbcTemplate, 930032L, 910032L, 920032L,
                Timestamp.valueOf("2026-09-17 10:00:00"));

        // when
        ShareHistoryDetailResponse response = shareService.readShareHistoryDetail(910032L, 930032L);

        // then
        assertAll(
                () -> assertThat(response.thumbnailUrl()).isEqualTo("https://img.example.com/media.jpg"),
                () -> assertThat(response.caption()).isEqualTo("장소가 없는 게시글"),
                () -> assertThat(response.author()).isEqualTo("@author"),
                () -> assertThat(response.extractionStatus()).isEqualTo("FAILED"),
                () -> assertThat(response.failureReason()).isEqualTo("PLACE_NOT_EXTRACTED"),
                () -> assertThat(response.places()).isEmpty()
        );
    }

    @Test
    void 서비스는_다른_회원의_공유를_조회하면_예외가_발생한다() {
        // given
        insertMember(910033L, "share-service-owner");
        insertMember(910034L, "share-service-other");
        createMedia(jdbcTemplate, 920033L, "게시글", "https://img.example.com/media.jpg", "@author");
        createSharedMedia(jdbcTemplate, 930033L, 910033L, 920033L,
                Timestamp.valueOf("2026-09-17 10:00:00"));

        // when & then
        assertThatThrownBy(() -> shareService.readShareHistoryDetail(910034L, 930033L))
                .isInstanceOf(ShareException.class)
                .hasMessage("존재하지 않는 공유입니다.");
    }

    @Test
    void 서비스는_없는_공유를_조회하면_예외가_발생한다() {
        // given
        insertMember(910035L, "share-service-missing-user");

        // when & then
        assertThatThrownBy(() -> shareService.readShareHistoryDetail(910035L, 999999L))
                .isInstanceOf(ShareException.class)
                .hasMessage("존재하지 않는 공유입니다.");
    }

    @Test
    void 서비스는_히스토리_목록을_최근순_응답으로_조립한다() {
        // given
        insertMember(910036L, "share-service-list-user");
        createMedia(jdbcTemplate, 920036L, "성공 게시글", "https://img.example.com/succeeded.jpg", "@succeeded");
        insertMediaWithStatus(920037L, null, null, null, "FAILED", "CONTENT_UNAVAILABLE");

        createSharedMedia(jdbcTemplate, 930036L, 910036L, 920036L,
                Timestamp.valueOf("2026-09-17 10:00:00"));
        createSharedMedia(jdbcTemplate, 930037L, 910036L, 920037L,
                Timestamp.valueOf("2026-09-17 10:01:00"));

        // when
        ShareHistoryResponses response = shareService.readShareHistory(910036L);

        // then
        ShareHistoryResponse failed = response.sharedMedias().getFirst();
        ShareHistoryResponse succeeded = response.sharedMedias().getLast();
        assertAll(
                () -> assertThat(response.sharedMedias()).hasSize(2),
                () -> assertThat(failed.sharedMediaId()).isEqualTo(930037L),
                () -> assertThat(failed.thumbnailUrl()).isNull(),
                () -> assertThat(failed.caption()).isNull(),
                () -> assertThat(failed.author()).isNull(),
                () -> assertThat(failed.extractionStatus()).isEqualTo("FAILED"),
                () -> assertThat(failed.sharedUrl())
                        .isEqualTo("https://www.instagram.com/reel/fixture-930037/"),
                () -> assertThat(succeeded.sharedMediaId()).isEqualTo(930036L),
                () -> assertThat(succeeded.thumbnailUrl())
                        .isEqualTo("https://img.example.com/succeeded.jpg"),
                () -> assertThat(succeeded.caption()).isEqualTo("성공 게시글"),
                () -> assertThat(succeeded.author()).isEqualTo("@succeeded"),
                () -> assertThat(succeeded.extractionStatus()).isEqualTo("SUCCEEDED"),
                () -> assertThat(succeeded.sharedUrl())
                        .isEqualTo("https://www.instagram.com/reel/fixture-930036/")
        );
    }

    @Test
    void 서비스는_히스토리가_없으면_빈_응답을_조립한다() {
        // when
        ShareHistoryResponses response = shareService.readShareHistory(910037L);

        // then
        assertThat(response.sharedMedias()).isEmpty();
    }

    private void insertMember(Long memberId, String providerUserId) {
        jdbcTemplate.update("""
                INSERT INTO members (
                    id, oauth_provider, provider_user_id, nickname, email, image_url
                )
                VALUES (?, 'KAKAO', ?, ?, ?, ?)
                """, memberId, providerUserId, providerUserId,
                providerUserId + "@example.com", "https://img.example.com/" + providerUserId);
    }

    private void insertMediaWithStatus(
            Long mediaId,
            String caption,
            String thumbnailUrl,
            String author,
            String extractionStatus,
            String failureReason
    ) {
        jdbcTemplate.update("""
                INSERT INTO media (
                    id, media_shortcode, caption, thumbnail_url, author,
                    extraction_status, failure_reason, extraction_version, source_type
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'SEEDED')
                """, mediaId, "fixture-media-" + mediaId, caption, thumbnailUrl, author,
                extractionStatus, failureReason);
    }
}
