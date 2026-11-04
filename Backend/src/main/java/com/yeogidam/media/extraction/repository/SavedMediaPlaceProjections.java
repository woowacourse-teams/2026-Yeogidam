package com.yeogidam.media.extraction.repository;

import java.util.List;

/**
 * 고른 게시물들에서 추출 순서로 읽은 장소를 담고, 게시물마다 장소를 같은 순서로 골라 준다.
 */
public record SavedMediaPlaceProjections(
        List<SavedMediaPlaceProjection> places
) {

    /**
     * 게시물에서 추출된 장소를 추출 순서대로 돌려주고, 장소가 없으면 빈 목록을 돌려준다.
     */
    public List<SavedMediaPlaceProjection> placesOf(Long mediaId) {
        return places.stream()
                .filter(place -> place.mediaId().equals(mediaId))
                .toList();
    }
}
