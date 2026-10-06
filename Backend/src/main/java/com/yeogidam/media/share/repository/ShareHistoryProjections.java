package com.yeogidam.media.share.repository;

import java.util.List;

/**
 * 히스토리 한 페이지를 만들 때 쓰는 공유 목록이다.
 * DAO가 페이지 크기(50건)보다 한 건 더 읽어 오므로, 51번째 공유가 있으면 다음 페이지가 있다.
 * 몇 건씩 보여 줄지는 조회 규칙이라 도메인이 아니라 읽기 모델에 둔다.
 */
public record ShareHistoryProjections(
        List<ShareHistoryProjection> shares
) {

    public static final int PAGE_SIZE = 50;
    public static final int FETCH_SIZE = PAGE_SIZE + 1;

    public List<ShareHistoryProjection> page() {
        return shares.stream()
                .limit(PAGE_SIZE)
                .toList();
    }

    /**
     * 다음 페이지가 있으면 이번 페이지 마지막 공유로 커서를 만들고, 없으면 null을 반환한다.
     */
    public ShareHistoryCursor nextCursor() {
        if (shares.size() <= PAGE_SIZE) {
            return null;
        }
        ShareHistoryProjection last = shares.get(PAGE_SIZE - 1);
        return new ShareHistoryCursor(last.createdAt(), last.sharedMediaId());
    }
}
