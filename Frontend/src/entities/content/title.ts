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

/**
 * 게시물 상세에 보여 줄 전체 캡션을 정리합니다. 제목과 같은 기준으로 첫 따옴표 앞의
 * 군더더기(예: `계정 on Instagram: "`)와 끝의 닫는 따옴표를 걷어내되, 줄바꿈은 그대로 둡니다.
 * 캡션이 없으면 빈 문자열을 돌려줍니다.
 */
export function normalizeReelCaption(
  description: string | null | undefined,
): string {
  const source = description?.trim();
  if (!source) return '';

  const quoteMatch = source.match(CAPTION_QUOTE_PATTERN);
  const content = quoteMatch
    ? source.slice((quoteMatch.index ?? -1) + 1).replace(/["“”＂]\s*$/, '')
    : source;

  return content
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
