package com.yeogidam.media.extraction.infrastructure.loadtest;

import com.yeogidam.media.exception.MediaErrorCode;
import com.yeogidam.media.exception.MediaException;
import com.yeogidam.media.extraction.config.LoadTestProperties;
import com.yeogidam.media.extraction.repository.LoadTestMediaDao;
import com.yeogidam.media.instagram.domain.InstagramUrl;
import java.util.List;
import lombok.RequiredArgsConstructor;

@RequiredArgsConstructor
public class LoadTestRoutingPolicy {

    private final LoadTestProperties properties;
    private final LoadTestMediaDao loadTestMediaDao;

    public void validateShare(Long memberId, InstagramUrl url) {
        String shortcode = url.getMediaShortcode().value();
        if (!shortcode.startsWith("ydlt_")) {
            return;
        }
        if (!properties.isDedicatedMedia(shortcode) || !properties.isAllowedMember(memberId)) {
            throw new MediaException(MediaErrorCode.UNSUPPORTED_LINK);
        }
    }

    public boolean canUseFake(Long mediaId, InstagramUrl url) {
        if (!properties.isDedicatedMedia(url.getMediaShortcode().value())) {
            return false;
        }
        List<Long> owners = loadTestMediaDao.findMemberIds(mediaId);
        if (owners.isEmpty() || owners.stream().anyMatch(memberId -> !properties.isAllowedMember(memberId))) {
            throw new IllegalStateException("전용 미디어에 허용되지 않은 공유자가 있습니다.");
        }
        return true;
    }
}
