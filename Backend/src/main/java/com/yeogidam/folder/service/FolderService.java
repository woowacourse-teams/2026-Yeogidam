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
}
