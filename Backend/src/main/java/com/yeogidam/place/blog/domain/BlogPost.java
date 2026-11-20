package com.yeogidam.place.blog.domain;

import java.time.LocalDate;

/**
 * 블로그 검색 결과 한 건으로, 글자 값은 HTML 엔티티를 글자로 바꾸고 검색 강조 태그를 걷은 값이다.
 * 블로그 이름이나 작성일을 읽지 못하면 해당 값은 null이다.
 */
public record BlogPost(
        String title,
        String bloggerName,
        LocalDate postDate,
        String link
) {
}
