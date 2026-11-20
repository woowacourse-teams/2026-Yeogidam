package com.yeogidam.folder.service;

import com.yeogidam.folder.domain.FolderAssignment;
import com.yeogidam.folder.dto.request.FolderAssignmentRequest;
import com.yeogidam.folder.exception.FolderErrorCode;
import com.yeogidam.folder.exception.FolderException;
import com.yeogidam.folder.repository.FolderSavedPlaceDao;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class FolderAssignmentService {

    private final FolderSavedPlaceDao folderSavedPlaceDao;

    /**
     * 보관함 장소가 담긴 폴더를 요청한 목록과 똑같이 맞추며, 보관함 장소나 폴더가 하나라도 회원의 것이 아니면 404를 돌려준다.
     * 이미 담긴 폴더의 연결은 그대로 두고, 빠진 폴더에서는 빼고 새 폴더에는 넣는다.
     * 같은 장소에 요청이 동시에 겹치면 UNIQUE 위반으로 500이 날 수 있지만, 저장 버튼으로는 생기기 어려워서 잠그지 않는다.
     */
    @Transactional
    public void updateFolderAssignment(
            Long memberId,
            Long savedPlaceId,
            FolderAssignmentRequest request
    ) {
        Set<Long> folderIds = request.folderIds();
        if (!folderSavedPlaceDao.isOwnedByMember(memberId, savedPlaceId, folderIds)) {
            throw new FolderException(FolderErrorCode.SAVED_PLACE_OR_FOLDER_NOT_FOUND);
        }
        FolderAssignment currentAssignment = new FolderAssignment(folderSavedPlaceDao.findFolderIds(savedPlaceId));
        folderSavedPlaceDao.saveAll(savedPlaceId, currentAssignment.selectFolderIdsToAdd(folderIds));
        folderSavedPlaceDao.deleteBySavedPlaceAndFolderIds(
                savedPlaceId, currentAssignment.selectFolderIdsToRemove(folderIds));
    }
}
