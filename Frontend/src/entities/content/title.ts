const CAPTION_QUOTE_PATTERN = /["“”＂]/;

/** 릴스 제목으로 사용할 캡션을 화면 표시용 한 줄로 정규화합니다. */
export function normalizeReelTitle(
  description: string | null | undefined,
  title: string | null | undefined,
): string {
  const source = description?.trim() || title?.trim();
  if (!source) return '저장한 콘텐츠';

  const quoteMatch = source.match(CAPTION_QUOTE_PATTERN);
  const content = quoteMatch
    ? source.slice((quoteMatch.index ?? -1) + 1)
    : source;

  return content.split('\n')[0]?.trim() || '저장한 콘텐츠';
}
