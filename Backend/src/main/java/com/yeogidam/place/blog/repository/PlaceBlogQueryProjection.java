package com.yeogidam.place.blog.repository;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 장소 상세 블로그 탭의 검색어를 만들 장소 이름과 지번 주소로, 검색어는 「장소 이름 + 동」이다.
 */
public record PlaceBlogQueryProjection(
        String name,
        String landLotAddress
) {

    // 지번 주소에서 읍, 면, 동, 로(세종로 같은 법정동)나 「숫자+가」로 끝나는 첫 낱말. 「서울 성동구 성수동2가 1-1」에서는 「성수동2가」다.
    private static final Pattern NEIGHBORHOOD =
            Pattern.compile("(?<!\\S)([가-힣]+(?:[0-9]*(?:읍|면|동|로)|[0-9]+가))(?=\\s|$)");

    // 블로그 글은 「성수동2가」, 「을지로3가」보다 「성수동」, 「을지로」로 적는 일이 많아 끝의 「숫자+가」를 뗀다.
    private static final Pattern NUMBERED_GA_SUFFIX = Pattern.compile("[0-9]+가$");

    /**
     * 장소 이름 뒤에 지번 주소의 동을 붙이고, 동을 찾지 못하면 이름만 쓴다.
     * 이름에 같은 동이 들어 있어도 붙인다. 「우동집」의 「우동」처럼 우연히 겹친 글자로 지역을 빼면 다른 지역 글이 섞이기 때문이다.
     */
    public String searchQuery() {
        Matcher matcher = NEIGHBORHOOD.matcher(landLotAddress);
        if (!matcher.find()) {
            return name;
        }
        String neighborhood = NUMBERED_GA_SUFFIX.matcher(matcher.group(1))
                .replaceFirst("");
        return name + " " + neighborhood;
    }
}
