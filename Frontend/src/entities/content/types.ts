export type SaveSource = 'url_input' | 'instagram_share';

export type ContentType = 'instagram_reel' | 'unsupported';

export type SaveInstagramReelResponse = {
  reelId: string;
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  placeId?: string;
  placeIds?: string[];
  failureReason?: string;
  reused: boolean;
};
