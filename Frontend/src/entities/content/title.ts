const CAPTION_QUOTE_PATTERN = /["“”＂]/;

/** 캡션과 제목이 모두 없을 때 보이는 기본 제목입니다. 제목을 얻었는지 판정하는 쪽도 이 값과 비교합니다. */
export const DEFAULT_REEL_TITLE = '저장한 콘텐츠';

/** 릴스 제목으로 사용할 캡션을 화면 표시용 한 줄로 정규화합니다. */
export function normalizeReelTitle(
  description: string | null | undefined,
  title: string | null | undefined,
): string {
  const source = description?.trim() || title?.trim();
  if (!source) return DEFAULT_REEL_TITLE;

  const quoteMatch = source.match(CAPTION_QUOTE_PATTERN);
  const content = quoteMatch
    ? source.slice((quoteMatch.index ?? -1) + 1)
    : source;

  return content.split('\n')[0]?.trim() || DEFAULT_REEL_TITLE;
}
