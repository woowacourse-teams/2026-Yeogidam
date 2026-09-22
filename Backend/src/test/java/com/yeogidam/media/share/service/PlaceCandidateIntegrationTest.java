package com.yeogidam.media.share.service;

import static com.yeogidam.support.fixture.sql.MediaSqlFixture.insertMedia;
import static com.yeogidam.support.fixture.sql.MemberSqlFixture.insertKakaoMember;
import static com.yeogidam.support.fixture.sql.PlaceCandidateSqlFixture.insertUndecidedCandidate;
import static com.yeogidam.support.fixture.sql.PlaceSqlFixture.insertPlace;
import static com.yeogidam.support.fixture.sql.SharedMediaSqlFixture.insertSharedMedia;
import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertAll;

import com.yeogidam.media.share.dto.response.PlaceCandidateResponse;
import com.yeogidam.media.share.dto.response.SharedMediaWithPlaceCandidatesResponses;
import com.yeogidam.media.share.dto.response.SharedMediaWithPlaceCandidatesResponse;
import com.yeogidam.support.IntegrationTestSupport;
import java.math.BigDecimal;
import java.sql.Timestamp;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

class PlaceCandidateIntegrationTest extends IntegrationTestSupport {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private PlaceCandidateService placeCandidateService;

    @Test
    void 미결정_장소_후보가_있는_공유_미디어를_장소와_함께_조회한다() {
        // given
        insertKakaoMember(jdbcTemplate, 1L, "member-123ijfsa", "member-123ijfsa",
                "member-123ijfsa@example.com", "https://img.example.com/member-123ijfsa");
        insertMedia(jdbcTemplate, 1L, "성수 장소 모음", "https://img.example.com/media.jpg", "@seongsu");
        insertSharedMedia(jdbcTemplate, 1L, 1L, 1L,
                timestamp("2026-09-17 10:00:00"));

        insertPlace(jdbcTemplate, 1L, "kakao-fixture-1", "첫 장소", "카페",
                "서울 성동구", "서울 성동구", new BigDecimal("37.5796"), new BigDecimal("126.9770"),
                "https://place.map.kakao.com/1", null,
                "https://img.example.com/place-1.jpg", null, null);
        insertPlace(jdbcTemplate, 2L, "kakao-fixture-2", "두 번째 장소", "식당",
                "서울 종로구", "서울 종로구", new BigDecimal("37.5796"), new BigDecimal("126.9770"),
                "https://place.map.kakao.com/2", null,
                "https://img.example.com/place-2.jpg", null, null);

        insertUndecidedCandidate(jdbcTemplate, 1L, 1L, 1L);
        insertUndecidedCandidate(jdbcTemplate, 2L, 1L, 2L);

        // when
        SharedMediaWithPlaceCandidatesResponses response = placeCandidateService.readPlaceCandidates(1L);

        // then
        SharedMediaWithPlaceCandidatesResponse sharedMedia = response.sharedMedias().getFirst();
        PlaceCandidateResponse firstPlace = sharedMedia.places().getFirst();
        assertAll(
                () -> assertThat(response.sharedMedias()).hasSize(1),
                () -> assertThat(sharedMedia.sharedMediaId()).isEqualTo(1L),
                () -> assertThat(sharedMedia.thumbnailUrl()).isEqualTo("https://img.example.com/media.jpg"),
                () -> assertThat(sharedMedia.caption()).isEqualTo("성수 장소 모음"),
                () -> assertThat(sharedMedia.author()).isEqualTo("@seongsu"),
                () -> assertThat(sharedMedia.places()).extracting(PlaceCandidateResponse::placeId)
                        .containsExactly(1L, 2L),
                () -> assertThat(firstPlace.name()).isEqualTo("첫 장소"),
                () -> assertThat(firstPlace.landLotAddress()).isEqualTo("서울 성동구")
        );
    }

    private static Timestamp timestamp(String value) {
        return Timestamp.valueOf(value);
    }
}
