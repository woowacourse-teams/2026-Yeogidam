package com.yeogidam.place.domain;

/**
 * 추출된 장소에 대한 사용자의 결정 상태.
 * UNDECIDED(미결정)로 태어나 SAVED(지도 핀) 또는 DISCARDED(버림)로 결정되고, 결정은 UNDECIDED에서만 할 수 있다.
 * 운영 수파베이스에서 이관할 때의 매핑: 컬럼 review_status → decision_status, reviewed_at → decided_at,
 * 값 PENDING → UNDECIDED. 나머지 값(SAVED, DISCARDED)은 그대로다.
 */
public enum PlaceDecisionStatus {

    UNDECIDED,
    SAVED,
    DISCARDED
}
