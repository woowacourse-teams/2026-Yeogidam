package com.yeogidam.folder.service;

import com.yeogidam.folder.dto.response.FolderResponses;
import com.yeogidam.folder.repository.FolderDao;
import com.yeogidam.folder.repository.FolderProjection;
import java.util.List;
import lombok.RequiredArgsConstructor;
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
     * 폴더 하나를 지우며, 이미 지웠거나 없는 폴더, 남의 폴더여도 "그 폴더가 내 목록에 없다"는 결과가 같아서 멱등하게 204를 돌려준다.
     */
    @Transactional
    public void deleteFolder(Long memberId, Long folderId) {
        folderDao.deleteByMemberAndId(memberId, folderId);
    }
}
