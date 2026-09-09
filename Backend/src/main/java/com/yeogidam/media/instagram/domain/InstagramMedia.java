package com.yeogidam.media.instagram.domain;

import com.yeogidam.media.extraction.domain.InProgressExtraction;
import com.yeogidam.media.extraction.domain.ExtractionFailureReason;
import com.yeogidam.media.extraction.domain.Extraction;
import com.yeogidam.media.extraction.domain.ExtractedPlaces;

/**
 * 인스타그램 게시물 하나.
 * 정체성(shortcode), 표시용 내용, 추출 상태로 이루어지며 사용자와 공유 사건을 모른다.
 * 같은 게시물의 추출 결과는 모든 공유 건이 재사용한다. 표시용 내용은 도메인이 들되 검증하지 않는다.
 */
public class InstagramMedia {

    private final Long id;
    private final MediaShortcode shortcode;
    private MediaMetadata metadata;
    private Extraction extraction;

    public InstagramMedia(MediaShortcode shortcode) {
        this(null, shortcode, new MediaMetadata(null, null, null), new InProgressExtraction());
    }

    public InstagramMedia(
            Long id,
            MediaShortcode shortcode,
            MediaMetadata metadata,
            Extraction extraction
    ) {
        validate(shortcode, extraction);
        this.id = id;
        this.shortcode = shortcode;
        this.metadata = metadata;
        this.extraction = extraction;
    }

    private void validate(MediaShortcode shortcode, Extraction extraction) {
        if (shortcode == null) {
            throw new IllegalArgumentException("게시물 식별자가 비어 있습니다.");
        }
        if (extraction == null) {
            throw new IllegalArgumentException("추출 상태가 비어 있습니다.");
        }
    }

    public void succeed(ExtractedPlaces places) {
        this.extraction = extraction.succeed(places);
    }

    public void fail(ExtractionFailureReason failureReason) {
        this.extraction = extraction.fail(failureReason);
    }

    public void retry() {
        this.extraction = extraction.retry();
    }

    public void fillMetadata(MediaMetadata metadata) {
        this.metadata = metadata;
    }

    public Long id() {
        return id;
    }

    public MediaShortcode shortcode() {
        return shortcode;
    }

    public MediaMetadata metadata() {
        return metadata;
    }

    public Extraction extraction() {
        return extraction;
    }
}
