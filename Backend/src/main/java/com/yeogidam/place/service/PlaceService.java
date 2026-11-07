package com.yeogidam.place.service;

import com.yeogidam.media.instagram.infrastructure.MediaThumbnailUrlResolver;
import com.yeogidam.place.dto.response.PlaceInfoResponse;
import com.yeogidam.place.dto.response.PlaceMediaResponses;
import com.yeogidam.place.exception.PlaceErrorCode;
import com.yeogidam.place.exception.PlaceException;
import com.yeogidam.place.repository.PlaceDao;
import com.yeogidam.place.repository.PlaceInfoProjection;
import com.yeogidam.place.repository.PlaceMediaProjection;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PlaceService {

    private final PlaceDao placeDao;
    private final MediaThumbnailUrlResolver mediaThumbnailUrlResolver;

    public PlaceInfoResponse readPlaceInfo(Long memberId, Long placeId) {
        PlaceInfoProjection projection = placeDao.findInfoByMemberAndPlace(memberId, placeId)
                .orElseThrow(() -> new PlaceException(PlaceErrorCode.PLACE_NOT_FOUND));
        return PlaceInfoResponse.from(projection);
    }

    /**
     * 장소 상세에 보여 줄 내 게시글 목록으로, 보관함 저장 여부와 관계없이 해당 장소가 추출된 내 게시글을 읽는다.
     * 해당하는 게시글이 없거나 없는 장소 ID면 빈 목록을 돌려준다.
     */
    public PlaceMediaResponses readPlaceMedia(Long memberId, Long placeId) {
        List<PlaceMediaProjection> shares = placeDao.findMediaByMemberAndPlace(memberId, placeId);
        return PlaceMediaResponses.from(shares, mediaThumbnailUrlResolver::resolve);
    }
}
