import {supabase} from '../../lib/auth/supabase';
import type {
  ContentType,
  SaveInstagramReelResponse,
  SaveSource,
  ReelProcessingStatus,
  HistoryCursor,
  HistoryReel,
} from './types';
import {normalizeReelStatusError, reelErrorFromEnvelope, ReelApiError} from './errors';

const REEL_STATUS_SELECT =
  'id,processing_status,failure_reason,instagram_thumbnail_url,created_at';
const HISTORY_SELECT =
  'id,instagram_url,instagram_title,instagram_description,instagram_author_username,instagram_thumbnail_url,processing_status,failure_reason,save_mode,created_at';

export async function getHistoryReels(cursor?: HistoryCursor): Promise<{
  reels: HistoryReel[];
  nextCursor: HistoryCursor | null;
}> {
  const request = () => {
    let query = supabase
      .from('reels')
      .select(HISTORY_SELECT)
      .order('created_at', {ascending: false})
      .order('id', {ascending: false})
      .limit(51);

    if (cursor) {
      query = query.or(
        `created_at.lt.${encodeURIComponent(cursor.created_at)},and(created_at.eq.${encodeURIComponent(cursor.created_at)},id.lt.${cursor.id})`,
      );
    }

    return query.returns<HistoryReel>();
  };

  let {data, error} = await request();
  if (error?.code === 'PGRST301' || error?.message?.includes('401')) {
    const {error: refreshError} = await supabase.auth.refreshSession();
    if (!refreshError) {
      ({data, error} = await request());
    }
  }

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as unknown as HistoryReel[];
  const reels = rows.slice(0, 50);
  const last = reels.length === 50 ? reels[reels.length - 1] : null;
  return {
    reels,
    nextCursor: last ? {created_at: last.created_at, id: last.id} : null,
  };
}

export function detectContentType(url: string): ContentType {
  return normalizeInstagramContentUrl(url) ? 'instagram_reel' : 'unsupported';
}

export function normalizeInstagramContentUrl(url: string): string | null {
  try {
    const parsedUrl = new URL(url.trim());
    const hostname = parsedUrl.hostname.toLowerCase().replace(/^www\./, '');
    if (hostname !== 'instagram.com') return null;

    const pathParts = parsedUrl.pathname.split('/').filter(Boolean);
    const contentIndex = pathParts.findIndex(
      part => part === 'reel' || part === 'p',
    );
    const shortcode = pathParts[contentIndex + 1];
    if (contentIndex < 0 || !shortcode) return null;

    return `https://www.instagram.com/${pathParts[contentIndex]}/${shortcode}/`;
  } catch {
    // The caller handles unsupported or malformed URLs uniformly.
  }

  return null;
}

export async function saveInstagramReel(
  instagramUrl: string,
  source: SaveSource,
): Promise<SaveInstagramReelResponse> {
  const {data, error} = await supabase.functions.invoke<SaveInstagramReelResponse>(
    'save-instagram-reel',
    {
      body: {
        instagramUrl,
        source,
        forceReprocess: false,
      },
    },
  );

  if (error) {
    const context = (error as {context?: Response}).context;
    let envelope: unknown = null;
    if (context) {
      try {
        envelope = await context.clone().json();
      } catch {
        // Network or non-JSON gateway error.
      }
    }
    throw reelErrorFromEnvelope(envelope) ?? new ReelApiError({
      errorCode: 'CLIENT000_001',
      message: '인터넷 연결을 확인해주세요.',
      retryable: true,
      status: context?.status ?? null,
    });
  }

  if (!data) {
    throw new ReelApiError({
      errorCode: 'CLIENT000_003',
      message: '응답을 처리하지 못했어요.',
    });
  }

  return data;
}

export async function saveContent(
  url: string,
  source: SaveSource,
): Promise<SaveInstagramReelResponse> {
  const normalizedUrl = normalizeInstagramContentUrl(url);

  if (!normalizedUrl) {
    throw new ReelApiError({
      errorCode: 'REEL400_001',
      message: '지원하지 않는 링크입니다. Instagram 릴스 링크를 입력해주세요.',
      retryable: false,
      field: 'instagramUrl',
    });
  }

  return saveInstagramReel(normalizedUrl, source);
}

export async function getReelProcessingStatus(
  reelId: string,
): Promise<ReelProcessingStatus | null> {
  const {data, error} = await supabase
    .from('reels')
    .select(REEL_STATUS_SELECT)
    .eq('id', reelId)
    .maybeSingle<ReelProcessingStatus>();

  if (error) {
    throw normalizeReelStatusError(error);
  }

  return data;
}

/** 현재 로그인한 사용자의 최신 처리중 릴스를 복원합니다. */
export async function getLatestProcessingReel(): Promise<ReelProcessingStatus | null> {
  const {data, error} = await supabase
    .from('reels')
    .select(REEL_STATUS_SELECT)
    .in('processing_status', ['PENDING', 'PROCESSING'])
    .order('created_at', {ascending: false})
    .limit(1)
    .maybeSingle<ReelProcessingStatus>();

  if (error) {
    throw normalizeReelStatusError(error);
  }

  return data;
}
