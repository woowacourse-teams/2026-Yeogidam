package com.yeogidam.place.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.yeogidam.place.domain.Address;
import com.yeogidam.place.domain.Coordinate;
import com.yeogidam.place.domain.CountryCode;
import com.yeogidam.place.domain.Place;
import com.yeogidam.place.domain.PlaceExternalSource;
import com.yeogidam.place.domain.PlaceName;
import com.yeogidam.place.domain.PlaceProfile;
import com.yeogidam.place.domain.PlaceThumbnail;
import com.yeogidam.place.infrastructure.KakaoPlaceMetaReader;
import com.yeogidam.place.repository.PlaceDao;
import com.yeogidam.support.JdbcTestSupport;
import java.math.BigDecimal;
import java.net.http.HttpClient;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.ImportAutoConfiguration;
import org.springframework.boot.jackson.autoconfigure.JacksonAutoConfiguration;
import org.springframework.context.annotation.Import;

@Import(PlaceDao.class)
@ImportAutoConfiguration(JacksonAutoConfiguration.class)
class PlaceThumbnailServiceTest extends JdbcTestSupport {

    private static final String INSTAGRAM_THUMBNAIL_KEY = "yeogidam/instagram-thumbnails/DX4P4OmzonI.jpg";

    @Autowired
    private PlaceDao placeDao;

    private final RecordingKakaoPlaceMetaReader kakaoPlaceMetaReader = new RecordingKakaoPlaceMetaReader();

    @Test
    void 카카오_장소는_카카오_장소_페이지_사진을_저장해_쓴다() {
        // when
        Place place = service().resolve(kakaoPlace("26338954"), INSTAGRAM_THUMBNAIL_KEY);

        // then
        assertThat(place.profile().thumbnail())
                .isEqualTo(new PlaceThumbnail("yeogidam/place-thumbnails/26338954.webp", "KAKAO"));
        assertThat(kakaoPlaceMetaReader.requestedPlaceIds()).containsExactly("26338954");
    }

    @Test
    void 구글_장소는_카카오_장소_페이지를_읽지_않고_릴스_썸네일을_쓴다() {
        // when
        Place place = service().resolve(googlePlace("ChIJxwgCUhPnAGARoz8_83liVEk"), INSTAGRAM_THUMBNAIL_KEY);

        // then
        assertThat(place.profile().thumbnail()).isEqualTo(new PlaceThumbnail(INSTAGRAM_THUMBNAIL_KEY, "INSTAGRAM"));
        assertThat(kakaoPlaceMetaReader.requestedPlaceIds()).isEmpty();
    }

    private PlaceThumbnailService service() {
        PlaceThumbnailStore thumbnailStore = (kakaoPlaceId, sourceUrl) ->
                "yeogidam/place-thumbnails/" + kakaoPlaceId + ".webp";
        return new PlaceThumbnailService(placeDao, kakaoPlaceMetaReader, thumbnailStore);
    }

    private Place kakaoPlace(String kakaoPlaceId) {
        return new Place(null, PlaceExternalSource.kakao(kakaoPlaceId, "https://place.map.kakao.com/" + kakaoPlaceId),
                new PlaceProfile(new PlaceName("카페 온월"), new Address("서울 성동구 성수동2가 289-10", null),
                        new Coordinate(new BigDecimal("37.5445"), new BigDecimal("127.0561")), "음식점 > 카페",
                        null, null));
    }

    private Place googlePlace(String googlePlaceId) {
        return new Place(null, PlaceExternalSource.google(googlePlaceId),
                new PlaceProfile(new PlaceName("토미타 규카츠"), new Address("Osaka", null, new CountryCode("JP")),
                        new Coordinate(new BigDecimal("34.6630"), new BigDecimal("135.5020")), "음식점 > 일식",
                        null, null));
    }

    /**
     * 카카오 장소 페이지를 실제로 읽지 않고, 어떤 장소 ID로 읽으려 했는지만 남긴다.
     */
    private static class RecordingKakaoPlaceMetaReader extends KakaoPlaceMetaReader {

        private final List<String> requestedPlaceIds = new ArrayList<>();

        private RecordingKakaoPlaceMetaReader() {
            super(HttpClient.newHttpClient());
        }

        @Override
        public String readMainPhotoUrl(String placeId) {
            requestedPlaceIds.add(placeId);
            return "https://img1.kakaocdn.net/place/" + placeId + ".jpg";
        }

        private List<String> requestedPlaceIds() {
            return requestedPlaceIds;
        }
    }
}
