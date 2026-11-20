package com.yeogidam.support.fake;

import com.yeogidam.place.blog.domain.BlogSearchResult;
import com.yeogidam.place.blog.exception.PlaceBlogErrorCode;
import com.yeogidam.place.blog.exception.PlaceBlogException;
import com.yeogidam.place.blog.service.BlogSearcher;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

/**
 * 네이버를 부르지 않고 정해 둔 결과를 돌려주며, 받은 요청을 「검색어|개수」로 남긴다.
 */
public class FakeBlogSearcher implements BlogSearcher {

    private final AtomicReference<BlogSearchResult> result =
            new AtomicReference<>(new BlogSearchResult("NAVER", List.of()));
    private final AtomicBoolean failing = new AtomicBoolean();
    private final List<String> requests = new CopyOnWriteArrayList<>();

    @Override
    public BlogSearchResult search(String query, int size) {
        requests.add(query + "|" + size);
        if (failing.get()) {
            throw new PlaceBlogException(PlaceBlogErrorCode.BLOG_SEARCH_FAILED);
        }
        return result.get();
    }

    public void respondWith(BlogSearchResult value) {
        result.set(value);
    }

    public void fail() {
        failing.set(true);
    }

    public void reset() {
        result.set(new BlogSearchResult("NAVER", List.of()));
        failing.set(false);
        requests.clear();
    }

    public List<String> requests() {
        return List.copyOf(requests);
    }
}
