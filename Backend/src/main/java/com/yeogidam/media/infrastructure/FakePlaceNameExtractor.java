package com.yeogidam.media.infrastructure;

import com.yeogidam.place.service.CandidatePlaceName;
import com.yeogidam.media.service.InstagramContent;
import com.yeogidam.media.service.PlaceNameExtractor;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * TODO AI 호출(수파베이스 파이프라인의 추출 단계)로 교체한다.
 * 지금은 캡션에 등장하는 알려진 상호를 흉내 내서 돌려준다.
 */
@Component
public class FakePlaceNameExtractor implements PlaceNameExtractor {

    @Override
    public List<CandidatePlaceName> extract(InstagramContent instagramContent) {
        return List.of(
                new CandidatePlaceName("카페 온월"),
                new CandidatePlaceName("성수동 갈비집"));
    }
}
