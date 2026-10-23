package com.yeogidam.media.instagram.infrastructure;

import com.yeogidam.media.instagram.domain.MediaShortcode;

/** 인스타그램 썸네일을 저장해 키를 반환한다. 선택 썸네일을 저장할 수 없으면 null을 반환한다. */
public interface InstagramThumbnailStore {

    String store(MediaShortcode shortcode, String sourceUrl);
}
