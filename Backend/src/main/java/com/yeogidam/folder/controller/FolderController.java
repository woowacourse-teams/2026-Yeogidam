package com.yeogidam.folder.controller;

import com.yeogidam.auth.resolver.LoginMember;
import com.yeogidam.folder.dto.response.FolderResponses;
import com.yeogidam.folder.service.FolderService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/folders")
public class FolderController implements FolderApiDocs {

    private final FolderService folderService;

    @Override
    @GetMapping
    public ResponseEntity<FolderResponses> readFolders(@LoginMember Long memberId) {
        FolderResponses response = folderService.readFolders(memberId);
        return ResponseEntity.ok()
                .body(response);
    }
}
