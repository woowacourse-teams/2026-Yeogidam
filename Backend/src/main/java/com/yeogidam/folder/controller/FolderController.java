package com.yeogidam.folder.controller;

import com.yeogidam.auth.resolver.LoginMember;
import com.yeogidam.folder.dto.request.FolderCreateRequest;
import com.yeogidam.folder.dto.request.FolderUpdateRequest;
import com.yeogidam.folder.dto.response.FolderCreateResponse;
import com.yeogidam.folder.dto.response.FolderResponses;
import com.yeogidam.folder.service.FolderService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
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

    @Override
    @PostMapping
    public ResponseEntity<FolderCreateResponse> createFolder(@LoginMember Long memberId,
                                                             @Valid @RequestBody FolderCreateRequest request) {
        FolderCreateResponse response = folderService.createFolder(memberId, request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(response);
    }

    @Override
    @PutMapping("/{folderId}")
    public ResponseEntity<Void> updateFolder(@LoginMember Long memberId,
                                             @PathVariable Long folderId,
                                             @Valid @RequestBody FolderUpdateRequest request) {
        folderService.updateFolder(memberId, folderId, request);
        return ResponseEntity.noContent()
                .build();
    }

    @Override
    @DeleteMapping("/{folderId}")
    public ResponseEntity<Void> deleteFolder(@LoginMember Long memberId,
                                             @PathVariable Long folderId) {
        folderService.deleteFolder(memberId, folderId);
        return ResponseEntity.noContent()
                .build();
    }
}
