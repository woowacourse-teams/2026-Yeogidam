import {supabase} from '../../lib/auth/supabase';
import type {
  ContentType,
  SaveInstagramReelResponse,
  SaveSource,
} from './types';

export function detectContentType(url: string): ContentType {
  try {
    const parsedUrl = new URL(url.trim());
    const hostname = parsedUrl.hostname.toLowerCase().replace(/^www\./, '');

    if (
      hostname === 'instagram.com' &&
      /^\/(reel|p)\/[^/]+\/?$/i.test(parsedUrl.pathname)
    ) {
      return 'instagram_reel';
    }
  } catch {
    // The caller handles unsupported or malformed URLs uniformly.
  }

  return 'unsupported';
}

export async function saveInstagramReel(
  instagramUrl: string,
  source: SaveSource,
): Promise<SaveInstagramReelResponse> {
  const {data, error} = await supabase.functions.invoke<SaveInstagramReelResponse>(
    'save-instagram-reel',
    {
      body: {instagramUrl, source},
    },
  );

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error('릴스 저장 응답이 비어 있습니다.');
  }

  return data;
}

export async function saveContent(
  url: string,
  source: SaveSource,
): Promise<SaveInstagramReelResponse> {
  const normalizedUrl = url.trim();

  if (detectContentType(normalizedUrl) !== 'instagram_reel') {
    throw new Error('지원하지 않는 링크입니다. Instagram 릴스 링크를 입력해주세요.');
  }

  return saveInstagramReel(normalizedUrl, source);
}
