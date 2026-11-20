package com.yeogidam.place.blog.domain;

import java.util.List;

/**
 * 블로그 검색 결과로, source는 결과를 준 검색 서비스(NAVER)다.
 */
public record BlogSearchResult(
        String source,
        List<BlogPost> posts
) {

    public BlogSearchResult {
        posts = List.copyOf(posts);
    }
}
