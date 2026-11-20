package com.yeogidam.place.blog.service;

import com.yeogidam.place.blog.domain.BlogSearchResult;

public interface BlogSearcher {

    /**
     * 검색어로 찾은 블로그 글을 검색 결과 순서대로 최대 size개 돌려준다.
     * 검색 결과를 받지 못하면 PlaceBlogException(BLOG_SEARCH_FAILED)을 던진다.
     */
    BlogSearchResult search(String query, int size);
}
