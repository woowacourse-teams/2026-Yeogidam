package com.yeogidam.media.share;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertAll;
import static com.yeogidam.support.PlaceCandidateSqlFixture.insertMember;
import static com.yeogidam.support.PlaceCandidateSqlFixture.insertMedia;
import static com.yeogidam.support.PlaceCandidateSqlFixture.insertPlace;
import static com.yeogidam.support.PlaceCandidateSqlFixture.insertPlaceCandidate;
import static com.yeogidam.support.PlaceCandidateSqlFixture.insertSharedMedia;

import com.yeogidam.media.share.dto.response.PlaceCandidateResponse;
import com.yeogidam.media.share.dto.response.SharedMediaWithPlaceCandidatesResponses;
import com.yeogidam.media.share.dto.response.SharedMediaWithPlaceCandidatesResponse;
import com.yeogidam.media.share.service.PlaceCandidateService;
import com.yeogidam.support.IntegrationTestSupport;
import java.sql.Timestamp;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

class PlaceCandidateIntegrationTest extends IntegrationTestSupport {

    private static final long MEMBER_ID = 910010L;
    private static final long MEDIA_ID = 920010L;
    private static final long SHARED_MEDIA_ID = 930010L;

    private static final long FIRST_PLACE_ID = 940010L;
    private static final long SECOND_PLACE_ID = 940011L;

    private static final long FIRST_CANDIDATE_ID = 950010L;
    private static final long SECOND_CANDIDATE_ID = 950011L;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private PlaceCandidateService placeCandidateService;

    @Test
    void 서비스는_공유_미디어와_장소_프로젝션을_중첩된_응답으로_조립한다() {
        // given
        insertMember(jdbcTemplate, MEMBER_ID, "member-123ijfsa");
        insertMedia(jdbcTemplate, MEDIA_ID, "성수 장소 모음", "https://img.example.com/media.jpg", "@seongsu");
        insertSharedMedia(jdbcTemplate, SHARED_MEDIA_ID, MEMBER_ID, MEDIA_ID,
                Timestamp.valueOf("2026-09-17 10:00:00"));

        insertPlace(jdbcTemplate, FIRST_PLACE_ID, "첫 장소", "https://img.example.com/place-1.jpg", "카페",
                "서울 성동구");
        insertPlace(jdbcTemplate, SECOND_PLACE_ID, "두 번째 장소", "https://img.example.com/place-2.jpg", "식당",
                "서울 종로구");

        insertPlaceCandidate(jdbcTemplate, FIRST_CANDIDATE_ID, SHARED_MEDIA_ID, FIRST_PLACE_ID, "UNDECIDED");
        insertPlaceCandidate(jdbcTemplate, SECOND_CANDIDATE_ID, SHARED_MEDIA_ID, SECOND_PLACE_ID, "UNDECIDED");

        // when
        SharedMediaWithPlaceCandidatesResponses response = placeCandidateService.readPlaceCandidates(MEMBER_ID);

        // then
        SharedMediaWithPlaceCandidatesResponse sharedMedia = response.sharedMedias().getFirst();
        PlaceCandidateResponse firstPlace = sharedMedia.places().getFirst();
        assertAll(
                () -> assertThat(response.sharedMedias()).hasSize(1),
                () -> assertThat(sharedMedia.sharedMediaId()).isEqualTo(SHARED_MEDIA_ID),
                () -> assertThat(sharedMedia.thumbnailUrl()).isEqualTo("https://img.example.com/media.jpg"),
                () -> assertThat(sharedMedia.caption()).isEqualTo("성수 장소 모음"),
                () -> assertThat(sharedMedia.author()).isEqualTo("@seongsu"),
                () -> assertThat(sharedMedia.places()).extracting(PlaceCandidateResponse::placeId)
                        .containsExactly(FIRST_PLACE_ID, SECOND_PLACE_ID),
                () -> assertThat(firstPlace.name()).isEqualTo("첫 장소"),
                () -> assertThat(firstPlace.landLotAddress()).isEqualTo("서울 성동구")
        );
    }
}
