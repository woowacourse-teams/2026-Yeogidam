package com.yeogidam.place.service;

/** 카카오 장소 사진을 저장해 S3 객체 키를 반환한다. 선택 사진을 저장할 수 없으면 null을 반환한다. */
public interface PlaceThumbnailStore {

    String store(String kakaoPlaceId, String sourceUrl);
}
