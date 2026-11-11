package com.yeogidam.place.domain;

/**
 * 장소를 찾은 지도 회사다. 국내 장소는 카카오 로컬 검색에서 찾고, 해외 장소와 카카오가 찾지 못한 국내 장소는 Google Places에서 찾는다.
 * 앱은 모든 장소를 Google 지도 하나에 그리므로, 이 값은 장소를 어디서 찾았는지와 지도 앱 링크를 가를 때만 쓴다.
 */
public enum MapProvider {

    KAKAO,
    GOOGLE
}
