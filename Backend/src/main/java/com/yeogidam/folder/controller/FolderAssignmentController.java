package com.yeogidam.folder.controller;

import com.yeogidam.auth.resolver.LoginMember;
import com.yeogidam.folder.dto.request.FolderAssignmentRequest;
import com.yeogidam.folder.service.FolderAssignmentService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/folder-assignments")
public class FolderAssignmentController implements FolderAssignmentApiDocs {

    private final FolderAssignmentService folderAssignmentService;

    @Override
    @PutMapping("/{savedPlaceId}")
    public ResponseEntity<Void> updateFolderAssignment(@LoginMember Long memberId,
                                                       @PathVariable Long savedPlaceId,
                                                       @Valid @RequestBody FolderAssignmentRequest request) {
        folderAssignmentService.updateFolderAssignment(memberId, savedPlaceId, request);
        return ResponseEntity.noContent()
                .build();
    }
}
