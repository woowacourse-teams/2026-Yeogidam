package com.yeogidam.place.blog.service;

import com.yeogidam.place.blog.domain.BlogSearchResult;
import com.yeogidam.place.blog.dto.response.PlaceBlogResponses;
import com.yeogidam.place.blog.repository.PlaceBlogDao;
import com.yeogidam.place.blog.repository.PlaceBlogQueryProjection;
import com.yeogidam.place.exception.PlaceErrorCode;
import com.yeogidam.place.exception.PlaceException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/**
 * 장소 상세 블로그 탭의 글 목록으로, 요청마다 블로그 검색을 부르고 결과를 저장하거나 캐시하지 않는다.
 * 네이버 검색 API 약관 2.4가 서버 보관을 이력 조회와 개인화 목적에만 허용해서, 회원끼리 같이 쓰는 장소별 캐시를 둘 수 없다.
 * 블로그 검색을 기다리는 동안 DB 커넥션을 잡지 않도록 클래스에 트랜잭션을 걸지 않는다.
 */
@Service
@RequiredArgsConstructor
public class PlaceBlogService {

    private static final int BLOG_POST_COUNT = 5;

    private final PlaceBlogDao placeBlogDao;
    private final BlogSearcher blogSearcher;

    public PlaceBlogResponses readPlaceBlogs(Long placeId) {
        PlaceBlogQueryProjection place = placeBlogDao.findQueryByPlaceId(placeId)
                .orElseThrow(() -> new PlaceException(PlaceErrorCode.PLACE_NOT_FOUND));
        BlogSearchResult result = blogSearcher.search(place.searchQuery(), BLOG_POST_COUNT);
        return PlaceBlogResponses.from(result);
    }
}
