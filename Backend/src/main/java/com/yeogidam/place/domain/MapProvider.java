package com.yeogidam.place.domain;

/**
 * 장소를 찾은 지도 회사다. 지금은 모든 장소를 카카오 로컬 검색에서 찾아서 KAKAO이고, GOOGLE은 Google Places에서 찾은 장소에 쓴다.
 * 앱은 모든 장소를 Google 지도 하나에 그리므로, 이 값은 장소를 어디서 찾았는지와 지도 앱 링크를 가를 때만 쓴다.
 */
public enum MapProvider {

    KAKAO,
    GOOGLE
}
