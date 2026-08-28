import {supabase} from '../../lib/auth/supabase';
import type {
  ContentType,
  SaveInstagramReelResponse,
  SaveSource,
  ReelProcessingStatus,
} from './types';
import {normalizeReelStatusError, reelErrorFromEnvelope, ReelApiError} from './errors';

const REEL_STATUS_SELECT =
  'id,processing_status,failure_reason,instagram_thumbnail_url,created_at';

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
