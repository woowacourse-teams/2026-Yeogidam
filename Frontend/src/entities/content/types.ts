export type SaveSource = 'url_input' | 'instagram_share';

export type ContentType = 'instagram_reel' | 'unsupported';

export type SaveInstagramReelResponse = {
  reelId: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  saveMode: 'REVIEW_QUEUE' | 'AUTO_SAVE';
  placeId?: string;
  placeIds?: string[];
  failureReason?: string;
  reused: boolean;
};

export type ReelProcessingStatus = {
  id: string;
  processing_status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  failure_reason: string | null;
  instagram_thumbnail_url: string | null;
  created_at: string;
};

/** 서버가 내리는 분석 상태입니다. */
export type ExtractionStatus = 'EXTRACTING' | 'SUCCEEDED' | 'FAILED';

/** 서버가 내리는 분석 실패 사유입니다. 화면 문구는 앱이 고릅니다. */
export type ExtractionFailureReason =
  | 'CONTENT_UNAVAILABLE'
  | 'PLACE_NOT_EXTRACTED'
  | 'PLACE_NOT_MATCHED'
  | 'PROCESSING_FAILED'
  | 'UNEXPECTED';

/** 공유 이력 한 건입니다. 필드는 서버 응답과 같고 식별자만 문자열로 다룹니다. */
export type HistoryReel = {
  sharedMediaId: string;
  createdAt: string;
  thumbnailUrl: string | null;
  caption: string | null;
  author: string | null;
  extractionStatus: ExtractionStatus;
  /** extractionStatus가 FAILED일 때만 값이 있습니다. */
  failureReason: ExtractionFailureReason | null;
  sharedUrl: string;
};

/** 다음 페이지 커서입니다. createdAt은 서버가 준 문자열을 바꾸지 않고 그대로 돌려보냅니다. */
export type HistoryCursor = {
  createdAt: string;
  id: string;
};

export type HistoryPlace = {
  placeId: string;
  thumbnailUrl: string | null;
  name: string;
  category: string | null;
  landLotAddress: string;
  roadAddress: string | null;
};

/** sharedMediaId는 새로 만든 이력이거나 이미 분석 중인 같은 게시물 이력의 식별자입니다. */
export type ExtractionRetryResult = {
  sharedMediaId: string;
  extractionStatus: ExtractionStatus;
};

/** 히스토리 화면이 의존하는 공유 이력 계약입니다. */
export type HistoryRepository = {
  getHistoryReels: (cursor?: HistoryCursor) => Promise<{
    reels: HistoryReel[];
    nextCursor: HistoryCursor | null;
  }>;
  getHistoryReelPlaces: (sharedMediaId: string) => Promise<HistoryPlace[]>;
  retryHistoryExtraction: (
    sharedMediaId: string,
  ) => Promise<ExtractionRetryResult>;
  reportHistoryReel: (sharedMediaId: string) => Promise<void>;
};
