package com.yeogidam.media.share.controller;

import com.yeogidam.auth.resolver.LoginMember;
import com.yeogidam.media.share.dto.response.ShareHistoryDetailResponse;
import com.yeogidam.media.share.dto.response.ShareHistoryResponses;
import com.yeogidam.media.share.dto.response.PlaceCandidateResponses;
import com.yeogidam.media.share.service.ShareService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/shares")
@RequiredArgsConstructor
public class ShareController implements ShareApiDocs {

    private final ShareService shareService;

    @Override
    @GetMapping
    public ResponseEntity<ShareHistoryResponses> readShareHistory(@LoginMember Long memberId) {
        ShareHistoryResponses response = shareService.readShareHistory(memberId);
        return ResponseEntity.ok()
                .body(response);
    }

    @Override
    @GetMapping("/{sharedMediaId}/places")
    public ResponseEntity<PlaceCandidateResponses> readShareHistoryPlaces(
            @LoginMember Long memberId,
            @PathVariable Long sharedMediaId
    ) {
        PlaceCandidateResponses response = shareService.readShareHistoryPlaces(memberId, sharedMediaId);
        return ResponseEntity.ok()
                .body(response);
    }

    /*
    [사용처]

    1. 공유 미디어 접수 직후 상태 폴링: 링크를 넣고 나면 "이 공유가 분석 끝났나"를 3초마다 물어야 하는데,
    그건 한 건짜리 질문이라 목록 전체를 다시 읽는 것보다 한 건 조회가 맞다.

    2. 재시도 직후. 재시도하면 서버에 새 공유가 하나 생기는데, 그 건은 목록에 아직 없다.
     */
    @Override
    @GetMapping("/{sharedMediaId}")
    public ResponseEntity<ShareHistoryDetailResponse> readShareHistoryDetail(
            @LoginMember Long memberId,
            @PathVariable Long sharedMediaId
    ) {
        ShareHistoryDetailResponse response = shareService.readShareHistoryDetail(memberId, sharedMediaId);
        return ResponseEntity.ok()
                .body(response);
    }
}
