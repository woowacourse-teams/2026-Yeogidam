package com.yeogidam.place.service;

/**
 * 장소 저장 요청의 처리 결과로, 보관함 항목 ID와 보관함에 새 항목을 만들었는지(isCreated)를 담는다.
 */
public record SavedPlaceSaveResult(Long savedPlaceId, boolean isCreated) {

}
