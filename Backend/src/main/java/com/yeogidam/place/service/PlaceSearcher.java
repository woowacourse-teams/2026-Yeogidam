package com.yeogidam.place.service;

import java.util.Optional;

/**
 * 후보 장소 이름으로 실제 장소를 찾는 포트.
 * 실제 구현은 카카오 로컬 API. 지금은 Fake로 대체한다.
 */
public interface PlaceSearcher {

    Optional<SearchedPlace> search(CandidatePlaceName candidatePlaceName);
}
