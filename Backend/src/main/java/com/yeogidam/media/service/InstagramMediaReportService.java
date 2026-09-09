package com.yeogidam.media.service;

import com.yeogidam.media.share.repository.MediaShareReportDao;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class InstagramMediaReportService {

    private final InstagramMediaReader instagramMediaReader;
    private final MediaShareReportDao mediaShareReportDao;

    public InstagramMediaReportService(
            InstagramMediaReader instagramMediaReader,
            MediaShareReportDao mediaShareReportDao
    ) {
        this.instagramMediaReader = instagramMediaReader;
        this.mediaShareReportDao = mediaShareReportDao;
    }

    @Transactional
    public void createReport(
            Long memberId,
            Long shareId
    ) {
        instagramMediaReader.readOwnedShareView(memberId, shareId);
        mediaShareReportDao.insert(shareId);
    }
}
