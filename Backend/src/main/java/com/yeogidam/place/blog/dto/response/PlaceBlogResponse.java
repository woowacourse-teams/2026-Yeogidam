package com.yeogidam.place.blog.dto.response;

import com.yeogidam.place.blog.domain.BlogPost;
import java.time.LocalDate;

public record PlaceBlogResponse(
        String title,
        String bloggerName,
        LocalDate postDate,
        String link
) {
    public static PlaceBlogResponse from(BlogPost post) {
        return new PlaceBlogResponse(
                post.title(),
                post.bloggerName(),
                post.postDate(),
                post.link()
        );
    }
}
