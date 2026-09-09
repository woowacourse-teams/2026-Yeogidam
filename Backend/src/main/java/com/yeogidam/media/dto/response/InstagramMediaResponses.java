package com.yeogidam.media.dto.response;

import com.yeogidam.media.repository.MediaShareView;
import java.util.List;

public record InstagramMediaResponses(
        List<InstagramMediaResponse> media
) {

    public static InstagramMediaResponses from(List<MediaShareView> views) {
        List<InstagramMediaResponse> media = views.stream()
                .map(InstagramMediaResponse::from)
                .toList();
        return new InstagramMediaResponses(media);
    }
}
