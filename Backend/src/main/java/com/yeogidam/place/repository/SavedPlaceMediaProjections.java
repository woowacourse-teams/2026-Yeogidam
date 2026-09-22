package com.yeogidam.place.repository;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.function.BinaryOperator;
import java.util.stream.Collectors;

/**
 * 보관함 항목 하나에 연결된 공유 묶음. 같은 릴스를 여러 번 공유해 여러 번 저장했으면 최신 공유 한 건만 남기는 규칙을 가진다.
 * 무엇을 보여 줄지 정하는 화면 규칙이라 도메인이 아니라 읽기 모델에 둔다.
 */
public record SavedPlaceMediaProjections(
        List<SavedPlaceMediaProjection> shares
) {

    private static final Comparator<SavedPlaceMediaProjection> BY_SHARED_AT =
            Comparator.comparing(SavedPlaceMediaProjection::sharedAt)
                    .thenComparing(SavedPlaceMediaProjection::sharedMediaId);

    /**
     * 릴스마다 최신 공유 한 건만 남기고 최신 공유 순으로 돌려준다. 같은 시각이면 나중에 생긴(id가 큰) 공유가 최신이다.
     */
    public List<SavedPlaceMediaProjection> latestPerMedia() {
        Map<Long, SavedPlaceMediaProjection> latestByMedia = shares.stream()
                .collect(Collectors.toMap(
                        SavedPlaceMediaProjection::mediaId,
                        share -> share,
                        BinaryOperator.maxBy(BY_SHARED_AT)
                ));
        return latestByMedia.values()
                .stream()
                .sorted(BY_SHARED_AT.reversed())
                .toList();
    }
}
