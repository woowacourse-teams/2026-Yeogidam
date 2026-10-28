package com.yeogidam.folder.service;

import com.yeogidam.folder.domain.Folder;
import com.yeogidam.folder.domain.FolderColor;
import com.yeogidam.folder.domain.FolderName;
import com.yeogidam.folder.domain.Folders;
import com.yeogidam.folder.dto.request.FolderCreateRequest;
import com.yeogidam.folder.dto.request.FolderUpdateRequest;
import com.yeogidam.folder.dto.response.FolderCreateResponse;
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
     * 폴더를 만들고, 폴더가 이미 10개면 400을, 같은 이름의 폴더가 있으면 409를 돌려준다.
     * 이름이 다른 만들기 요청이 동시에 들어오면 10개를 넘을 수 있지만, 앱으로는 생기기 어렵고 피해가 요청한 회원 자신의 폴더 수에 그쳐서 회원 행을 잠그지 않는다.
     */
    @Transactional
    public FolderCreateResponse createFolder(Long memberId, FolderCreateRequest request) {
        FolderName name = new FolderName(request.name());
        FolderColor color = FolderColor.from(request.color());
        Folders folders = new Folders(folderDao.findFoldersByMember(memberId));
        folders.validateAddable();
        Folder folder = insertFolder(memberId, new Folder(name, color));
        return FolderCreateResponse.from(folder);
    }

    private Folder insertFolder(Long memberId, Folder folder) {
        try {
            return folderDao.save(memberId, folder);
        } catch (DuplicateKeyException exception) {
            throw new FolderException(FolderErrorCode.DUPLICATE_FOLDER_NAME);
        }
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
