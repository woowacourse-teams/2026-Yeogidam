package com.yeogidam.media.service;

import com.yeogidam.place.service.CandidatePlaceName;
import java.util.List;

/**
 * 게시물 내용에서 장소 이름 후보를 뽑는 포트.
 * 실제 구현은 AI 호출(수파베이스 파이프라인의 추출 단계). 지금은 Fake로 대체한다.
 */
public interface PlaceNameExtractor {

    List<CandidatePlaceName> extract(InstagramContent instagramContent);
}
