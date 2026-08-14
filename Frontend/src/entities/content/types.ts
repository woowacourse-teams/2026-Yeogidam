export type SaveSource = 'url_input' | 'instagram_share';

export type ContentType = 'instagram_reel' | 'unsupported';

export type SaveInstagramReelResponse = {
  reelId: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
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
