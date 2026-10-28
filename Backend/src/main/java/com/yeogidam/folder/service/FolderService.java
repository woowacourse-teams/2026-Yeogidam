package com.yeogidam.folder.service;

import com.yeogidam.folder.domain.Folder;
import com.yeogidam.folder.domain.FolderColor;
import com.yeogidam.folder.domain.FolderName;
import com.yeogidam.folder.dto.request.FolderUpdateRequest;
import com.yeogidam.folder.dto.response.FolderResponses;
import com.yeogidam.folder.exception.FolderErrorCode;
import com.yeogidam.folder.exception.FolderException;
import com.yeogidam.folder.repository.FolderDao;
import com.yeogidam.folder.repository.FolderProjection;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class FolderService {

    private final FolderDao folderDao;

    public FolderResponses readFolders(Long memberId) {
        List<FolderProjection> folders = folderDao.findAllByMember(memberId);
        return FolderResponses.from(folders);
    }

    /**
     * 폴더 이름과 색을 함께 바꾸며, 없는 폴더나 남의 폴더면 404를, 같은 회원의 다른 폴더와 이름이 겹치면 409를 돌려준다.
     */
    @Transactional
    public void updateFolder(Long memberId, Long folderId, FolderUpdateRequest request) {
        FolderName name = new FolderName(request.name());
        FolderColor color = FolderColor.from(request.color());
        Folder folder = folderDao.findByMemberAndId(memberId, folderId)
                .orElseThrow(() -> new FolderException(FolderErrorCode.FOLDER_NOT_FOUND));
        Folder changed = folder.change(name, color);
        saveFolder(memberId, changed);
    }

    private void saveFolder(Long memberId, Folder folder) {
        try {
            folderDao.update(memberId, folder);
        } catch (DuplicateKeyException exception) {
            throw new FolderException(FolderErrorCode.DUPLICATE_FOLDER_NAME);
        }
    }

    /**
     * 폴더 하나를 지우며, 이미 지웠거나 없는 폴더, 남의 폴더여도 "그 폴더가 내 목록에 없다"는 결과가 같아서 멱등하게 204를 돌려준다.
     */
    @Transactional
    public void deleteFolder(Long memberId, Long folderId) {
        folderDao.deleteByMemberAndId(memberId, folderId);
    }
}
