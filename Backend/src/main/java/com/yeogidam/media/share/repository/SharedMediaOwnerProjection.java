package com.yeogidam.media.share.repository;

public record SharedMediaOwnerProjection(
        Long sharedMediaId,
        Long memberId
) {
}
