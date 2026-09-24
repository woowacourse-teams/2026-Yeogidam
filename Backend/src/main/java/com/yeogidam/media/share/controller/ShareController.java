package com.yeogidam.media.share.controller;

import com.yeogidam.auth.resolver.LoginMember;
import com.yeogidam.media.share.dto.response.ShareHistoryItemResponse;
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
@RequiredArgsConstructor
@RequestMapping("/api/v1/shares")
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
    TODO
    [프론트엔드와 협의 후 안 써도 된다면 삭제할 예정]
    사용처: 장소 분석에 실패한 미디어를 재시도한 직후, 해당 히스토리의 처리 결과를 확인하기 위해 3초마다 호출하기 위함
     */
    @Override
    @GetMapping("/{sharedMediaId}")
    public ResponseEntity<ShareHistoryItemResponse> readShareHistoryItem(
            @LoginMember Long memberId,
            @PathVariable Long sharedMediaId
    ) {
        ShareHistoryItemResponse response = shareService.readShareHistoryItem(memberId, sharedMediaId);
        return ResponseEntity.ok()
                .body(response);
    }
}
